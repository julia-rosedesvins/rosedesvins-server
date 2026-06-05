import { z } from 'zod';

export const RejectSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'ID de souscription requis'),
  rejectionReason: z.string().optional(),
});

export type RejectSubscriptionDto = z.infer<typeof RejectSubscriptionSchema>;
