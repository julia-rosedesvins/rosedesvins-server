import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeLib = require('stripe');
import type { Stripe as StripeType } from 'stripe/cjs/stripe.core.js';

import { Transaction, TransactionStatus } from '../schemas/transaction.schema';
import { UserBooking } from '../schemas/user-bookings.schema';
import { PaymentMethods } from '../schemas/payment-methods.schema';

export interface CreateCheckoutSessionDto {
  /** The booking _id (already created with status payment_pending) */
  bookingId: string;
  /** The vendor's platform user ID */
  vendorUserId: string;
  /** Amount in EUR (not cents — we convert internally) */
  amountEur: number;
  /** URL to redirect after successful payment */
  successUrl: string;
  /** URL to redirect after cancelled payment */
  cancelUrl: string;
  /** For receipt / session metadata */
  customerEmail?: string;
  serviceName?: string;
  participantsAdults?: number;
  participantsEnfants?: number;
}

@Injectable()
export class StripeCheckoutService {
  private stripe: StripeType;

  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(UserBooking.name) private userBookingModel: Model<UserBooking>,
    @InjectModel(PaymentMethods.name) private paymentMethodsModel: Model<PaymentMethods>,
    private configService: ConfigService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured');
    this.stripe = new StripeLib(secretKey);
  }

  /**
   * Get the Stripe Connected Account ID for a vendor
   */
  async getVendorStripeAccountId(vendorUserId: string): Promise<string> {
    const pm = await this.paymentMethodsModel
      .findOne({ userId: vendorUserId })
      .lean()
      .exec();

    if (!pm?.stripeConnect?.stripeAccountId) {
      throw new BadRequestException(
        'This vendor does not have a connected Stripe account. They cannot accept online payments.',
      );
    }
    if (!pm.stripeConnect.chargesEnabled) {
      throw new BadRequestException(
        'The vendor\'s Stripe account is not fully verified yet. Online payments are not available.',
      );
    }
    return pm.stripeConnect.stripeAccountId;
  }

  /**
   * Create a Stripe Checkout Session (Stripe Connect — charges the vendor's account)
   */
  async createCheckoutSession(dto: CreateCheckoutSessionDto): Promise<{
    sessionId: string;
    sessionUrl: string;
  }> {
    const {
      bookingId,
      vendorUserId,
      amountEur,
      successUrl,
      cancelUrl,
      customerEmail,
      serviceName,
      participantsAdults = 0,
      participantsEnfants = 0,
    } = dto;

    // 1. Validate booking exists
    const booking = await this.userBookingModel.findById(bookingId).exec();
    if (!booking) throw new NotFoundException('Booking not found');

    // 2. Get vendor stripe account
    const stripeAccountId = await this.getVendorStripeAccountId(vendorUserId);

    // 3. Convert amount to cents
    const amountCents = Math.round(amountEur * 100);
    if (amountCents <= 0) throw new BadRequestException('Amount must be greater than 0');

    // 4. Create Stripe Checkout Session on the connected account
    const session = await this.stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: customerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: serviceName || 'Réservation',
                description: participantsAdults > 0
                  ? `${participantsAdults} adulte(s)${participantsEnfants > 0 ? `, ${participantsEnfants} enfant(s)` : ''}`
                  : undefined,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        success_url: `${successUrl}&payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${cancelUrl}&payment_cancelled=true`,
        metadata: {
          bookingId,
          vendorUserId,
          participantsAdults: String(participantsAdults),
          participantsEnfants: String(participantsEnfants),
        },
      },
      { stripeAccount: stripeAccountId },
    );

    // 5. Persist pending transaction record
    await this.transactionModel.create({
      bookingId: new Types.ObjectId(bookingId),
      vendorUserId: new Types.ObjectId(vendorUserId),
      stripeAccountId,
      stripeSessionId: session.id,
      amount: amountCents,
      currency: 'eur',
      status: 'pending' as TransactionStatus,
      customerEmail,
      participantsAdults,
      participantsEnfants,
      serviceName,
    });

    // 6. Update booking status to payment_pending
    await this.userBookingModel.findByIdAndUpdate(bookingId, {
      $set: { bookingStatus: 'payment_pending' },
    });

    return { sessionId: session.id, sessionUrl: session.url! };
  }

  /**
   * Handle incoming Stripe webhook events
   * This MUST receive the raw body (Buffer) for signature verification
   */
  async handleWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
    }

    let event: StripeType.Event;

    try {
      if (webhookSecret) {
        event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } else {
        // No secret configured — parse body directly (dev only)
        event = JSON.parse(rawBody.toString()) as StripeType.Event;
      }
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      throw new BadRequestException(`Webhook error: ${err.message}`);
    }

    console.log(`Received Stripe webhook: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object as StripeType.Checkout.Session);
        break;
      case 'checkout.session.expired':
        await this.handleCheckoutExpired(event.data.object as StripeType.Checkout.Session);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object as StripeType.PaymentIntent);
        break;
      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(session: StripeType.Checkout.Session): Promise<void> {
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) {
      console.warn('checkout.session.completed: missing bookingId in metadata', session.id);
      return;
    }

    // Update transaction
    await this.transactionModel.findOneAndUpdate(
      { stripeSessionId: session.id },
      {
        $set: {
          status: 'completed' as TransactionStatus,
          stripePaymentIntentId: session.payment_intent as string | undefined,
          lastWebhookEvent: 'checkout.session.completed',
        },
      },
    );

    // Update booking to confirmed
    await this.userBookingModel.findByIdAndUpdate(bookingId, {
      $set: { bookingStatus: 'confirmed' },
    });

    console.log(`✅ Payment completed for booking ${bookingId}, session ${session.id}`);
  }

  private async handleCheckoutExpired(session: StripeType.Checkout.Session): Promise<void> {
    const bookingId = session.metadata?.bookingId;

    await this.transactionModel.findOneAndUpdate(
      { stripeSessionId: session.id },
      {
        $set: {
          status: 'expired' as TransactionStatus,
          lastWebhookEvent: 'checkout.session.expired',
        },
      },
    );

    if (bookingId) {
      // Revert booking back to pending so the user can try again
      await this.userBookingModel.findByIdAndUpdate(bookingId, {
        $set: { bookingStatus: 'pending' },
      });
      console.log(`⚠️ Checkout expired for booking ${bookingId}, session ${session.id}`);
    }
  }

  private async handlePaymentFailed(paymentIntent: StripeType.PaymentIntent): Promise<void> {
    await this.transactionModel.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntent.id },
      {
        $set: {
          status: 'failed' as TransactionStatus,
          lastWebhookEvent: 'payment_intent.payment_failed',
        },
      },
    );

    console.log(`❌ Payment failed for PaymentIntent ${paymentIntent.id}`);
  }

  /**
   * Get a transaction by Stripe session ID
   */
  async getTransactionBySessionId(sessionId: string): Promise<Transaction | null> {
    return this.transactionModel.findOne({ stripeSessionId: sessionId }).lean().exec();
  }

  /**
   * Get all transactions for a vendor
   */
  async getVendorTransactions(vendorUserId: string): Promise<Transaction[]> {
    return this.transactionModel
      .find({ vendorUserId: new Types.ObjectId(vendorUserId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
