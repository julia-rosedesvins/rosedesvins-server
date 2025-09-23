import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Subscription extends Document {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true
  })
  adminId: Types.ObjectId;

  @Prop({
    type: Date,
    required: true
  })
  startDate: Date;

  @Prop({
    type: Date,
    required: true
  })
  endDate: Date;

  @Prop({
    type: Boolean,
    default: true
  })
  isActive: boolean;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  })
  cancelledById: Types.ObjectId | null;

  @Prop({
    type: Date,
    required: false,
    default: null
  })
  cancelledAt: Date | null;

  @Prop({
    type: String,
    required: false,
    trim: true
  })
  notes: string;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);

// Add indexes for better performance
SubscriptionSchema.index({ userId: 1 });
SubscriptionSchema.index({ adminId: 1 });
SubscriptionSchema.index({ isActive: 1 });
SubscriptionSchema.index({ startDate: 1, endDate: 1 });
SubscriptionSchema.index({ userId: 1, isActive: 1 });
