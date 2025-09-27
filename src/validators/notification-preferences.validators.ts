import { z } from 'zod';

// Import the notification options from the schema
import { NOTIFICATION_OPTIONS } from '../schemas/notification-preferences.schema';

export const CreateOrUpdateNotificationPreferencesSchema = z.object({
  customerNotificationBefore: z
    .enum([
      NOTIFICATION_OPTIONS.ONE_HOUR,
      NOTIFICATION_OPTIONS.TWO_HOURS,
      NOTIFICATION_OPTIONS.DAY_BEFORE,
      NOTIFICATION_OPTIONS.NEVER,
      NOTIFICATION_OPTIONS.LAST_MINUTE
    ] as const)
    .optional(),
  
  providerNotificationBefore: z
    .enum([
      NOTIFICATION_OPTIONS.ONE_HOUR,
      NOTIFICATION_OPTIONS.TWO_HOURS,
      NOTIFICATION_OPTIONS.DAY_BEFORE,
      NOTIFICATION_OPTIONS.NEVER,
      NOTIFICATION_OPTIONS.LAST_MINUTE
    ] as const)
    .optional(),
  
  bookingAdvanceLimit: z
    .enum([
      NOTIFICATION_OPTIONS.ONE_HOUR,
      NOTIFICATION_OPTIONS.TWO_HOURS,
      NOTIFICATION_OPTIONS.DAY_BEFORE,
      NOTIFICATION_OPTIONS.NEVER,
      NOTIFICATION_OPTIONS.LAST_MINUTE
    ] as const)
    .optional(),
  
  emailNotificationsEnabled: z
    .boolean()
    .optional(),
  
  smsNotificationsEnabled: z
    .boolean()
    .optional(),
  
  pushNotificationsEnabled: z
    .boolean()
    .optional(),
});

export type CreateOrUpdateNotificationPreferencesDto = z.infer<typeof CreateOrUpdateNotificationPreferencesSchema>;
