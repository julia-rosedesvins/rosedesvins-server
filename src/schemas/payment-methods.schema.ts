import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentMethodsDocument = PaymentMethods & Document;

// Available payment method options
export const PAYMENT_METHOD_OPTIONS = {
  BANK_CARD: 'bank card',
  CHECKS: 'checks',
  CASH: 'cash'
} as const;

export type PaymentMethodOption = typeof PAYMENT_METHOD_OPTIONS[keyof typeof PAYMENT_METHOD_OPTIONS];

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

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const PaymentMethodsSchema = SchemaFactory.createForClass(PaymentMethods);

// Create index on userId for better query performance
PaymentMethodsSchema.index({ userId: 1 });
