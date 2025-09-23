import { z } from 'zod';

export const CreateOrUpdateSubscriptionSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format'),
  
  startDate: z
    .string()
    .datetime('Invalid start date format. Use ISO 8601 format'),
  
  endDate: z
    .string()
    .datetime('Invalid end date format. Use ISO 8601 format'),
  
  notes: z
    .string()
    .max(500, 'Notes must not exceed 500 characters')
    .optional()
}).refine((data) => {
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  return endDate > startDate;
}, {
  message: 'End date must be after start date',
  path: ['endDate']
});

export const GetAllSubscriptionsSchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'Page must be a number')
    .transform(Number)
    .refine(val => val > 0, 'Page must be greater than 0')
    .optional(),
  
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a number')
    .transform(Number)
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional(),
  
  status: z
    .enum(['active', 'inactive'])
    .optional(),
  
  userId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid user ID format')
    .optional()
});

export type CreateOrUpdateSubscriptionDto = z.infer<typeof CreateOrUpdateSubscriptionSchema>;
export type GetAllSubscriptionsDto = z.infer<typeof GetAllSubscriptionsSchema>;
