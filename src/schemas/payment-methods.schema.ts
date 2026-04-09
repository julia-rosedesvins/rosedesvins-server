import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentMethodsDocument = PaymentMethods & Document;

// Available payment method options
export const PAYMENT_METHOD_OPTIONS = {
  BANK_CARD: 'bank card',
  CHECKS: 'checks',
  CASH: 'cash',
  STRIPE: 'stripe'
} as const;

export type PaymentMethodOption = typeof PAYMENT_METHOD_OPTIONS[keyof typeof PAYMENT_METHOD_OPTIONS];

// Stripe Connect account info
export interface StripeConnectAccount {
  stripeAccountId: string; // Stripe Connected Account ID (acct_xxxxx)
  stripeCustomerId?: string; // For reference
  isVerified: boolean; // Whether the account has passed verification
  chargesEnabled: boolean; // Whether the account can accept payments
  connectedAt: Date; // When the account was connected
  displayName?: string; // Business name from Stripe
}

@Schema({
  timestamps: true,
  collection: 'payment-methods'
})
export class PaymentMethods {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ 
    type: [String], 
    enum: Object.values(PAYMENT_METHOD_OPTIONS),
    default: []
  })
  methods: PaymentMethodOption[];

  // Stripe Connect integration
  @Prop({ type: Object, default: null })
  stripeConnect?: StripeConnectAccount | null;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PaymentMethodsSchema = SchemaFactory.createForClass(PaymentMethods);

// Create index on userId for better query performance
PaymentMethodsSchema.index({ userId: 1 });
PaymentMethodsSchema.index({ 'stripeConnect.stripeAccountId': 1 });
