import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum SubscriptionStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

@Schema({
  timestamps: true,
})
export class NewsletterSubscription extends Document {
  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true
  })
  email: string;

  @Prop({
    type: String,
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PENDING
  })
  status: SubscriptionStatus;

  @Prop({
    type: String,
    default: null
  })
  approvedBy: string | null;

  @Prop({
    type: Date,
    default: null
  })
  approvedAt: Date | null;

  @Prop({
    type: String,
    default: null
  })
  rejectedBy: string | null;

  @Prop({
    type: Date,
    default: null
  })
  rejectedAt: Date | null;

  @Prop({
    type: String,
    default: null
  })
  rejectionReason: string | null;

  @Prop({
    type: String,
    default: null
  })
  createdUserId: string | null;
}

export const NewsletterSubscriptionSchema = SchemaFactory.createForClass(NewsletterSubscription);
