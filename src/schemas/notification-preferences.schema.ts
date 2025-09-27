import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationPreferencesDocument = NotificationPreferences & Document;

// Predefined notification options (can be easily modified)
export const NOTIFICATION_OPTIONS = {
  ONE_HOUR: '1_hour',
  TWO_HOURS: '2_hours', 
  DAY_BEFORE: 'day_before',
  NEVER: 'never',
  LAST_MINUTE: 'last_minute'
} as const;

export type NotificationOption = typeof NOTIFICATION_OPTIONS[keyof typeof NOTIFICATION_OPTIONS];

// Option labels for display purposes
export const NOTIFICATION_OPTION_LABELS = {
  [NOTIFICATION_OPTIONS.ONE_HOUR]: '1 hour',
  [NOTIFICATION_OPTIONS.TWO_HOURS]: '2 hours',
  [NOTIFICATION_OPTIONS.DAY_BEFORE]: 'The day before',
  [NOTIFICATION_OPTIONS.NEVER]: 'Never',
  [NOTIFICATION_OPTIONS.LAST_MINUTE]: 'Last minute'
};

@Schema({
  timestamps: true,
  collection: 'notification-preferences'
})
export class NotificationPreferences {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  // How long before the booking starts to notify the customer
  @Prop({ 
    required: true,
    enum: Object.values(NOTIFICATION_OPTIONS),
    default: NOTIFICATION_OPTIONS.DAY_BEFORE
  })
  customerNotificationBefore: NotificationOption;

  // How long before the booking starts to notify the service provider (you)
  @Prop({ 
    required: true,
    enum: Object.values(NOTIFICATION_OPTIONS),
    default: NOTIFICATION_OPTIONS.TWO_HOURS
  })
  providerNotificationBefore: NotificationOption;

  // How far in advance of a tour start can a customer book
  @Prop({ 
    required: true,
    enum: Object.values(NOTIFICATION_OPTIONS),
    default: NOTIFICATION_OPTIONS.DAY_BEFORE
  })
  bookingAdvanceLimit: NotificationOption;

  // Additional settings
  @Prop({ default: true })
  emailNotificationsEnabled: boolean;

  @Prop({ default: true })
  smsNotificationsEnabled: boolean;

  @Prop({ default: true })
  pushNotificationsEnabled: boolean;

  @Prop()
  createdAt: Date;

  @Prop()
  updatedAt: Date;
}

export const NotificationPreferencesSchema = SchemaFactory.createForClass(NotificationPreferences);

// Create compound index on userId for better query performance
NotificationPreferencesSchema.index({ userId: 1 });
