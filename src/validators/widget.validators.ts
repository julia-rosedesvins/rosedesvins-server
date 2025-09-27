import { z } from 'zod';
import { Types } from 'mongoose';

export const WidgetDataQuerySchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .refine((val) => Types.ObjectId.isValid(val), 'Invalid user ID format'),
  
  serviceId: z
    .string()
    .min(1, 'Service ID is required')
    .refine((val) => !isNaN(parseInt(val)) && parseInt(val) >= 0, 'Service ID must be a valid non-negative number'),
});

export type WidgetDataQueryDto = z.infer<typeof WidgetDataQuerySchema>;
