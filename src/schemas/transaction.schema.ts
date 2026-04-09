import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'expired';

@Schema({
  timestamps: true,
  collection: 'transactions',
})
export class Transaction extends Document {
  /** The booking this payment belongs to */
  @Prop({ type: Types.ObjectId, ref: 'UserBooking', required: true, index: true })
  bookingId: Types.ObjectId;

  /** The customer's user account (widget vendor) */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  vendorUserId: Types.ObjectId;

  /** Stripe Connect account ID of the vendor */
  @Prop({ required: true, trim: true })
  stripeAccountId: string;

  /** Stripe Checkout Session ID */
  @Prop({ required: true, trim: true, unique: true, index: true })
  stripeSessionId: string;

  /** Stripe PaymentIntent ID — populated after payment */
  @Prop({ trim: true, index: true })
  stripePaymentIntentId?: string;

  /** Amount in smallest currency unit (e.g. cents for EUR) */
  @Prop({ required: true, min: 0 })
  amount: number;

  /** ISO 4217 currency code, e.g. 'eur' */
  @Prop({ required: true, default: 'eur', lowercase: true })
  currency: string;

  /** Current status of this transaction */
  @Prop({
    required: true,
    enum: ['pending', 'completed', 'failed', 'refunded', 'expired'],
    default: 'pending',
    index: true,
  })
  status: TransactionStatus;

  /** Snapshot of customer email at time of payment */
  @Prop({ trim: true })
  customerEmail?: string;

  /** Number of adults (for display / auditing) */
  @Prop({ default: 0 })
  participantsAdults: number;

  /** Number of children (for display / auditing) */
  @Prop({ default: 0 })
  participantsEnfants: number;

  /** Service name snapshot */
  @Prop({ trim: true })
  serviceName?: string;

  /** Stripe webhook event that last updated this record */
  @Prop({ trim: true })
  lastWebhookEvent?: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index({ vendorUserId: 1, createdAt: -1 });
TransactionSchema.index({ stripeSessionId: 1 }, { unique: true });
