import { z } from 'zod';

export const ApproveSubscriptionSchema = z.object({
  subscriptionId: z.string().min(1, 'ID de souscription requis'),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom de famille requis'),
  domainName: z.string().min(1, 'Nom du domaine requis'),
});

export type ApproveSubscriptionDto = z.infer<typeof ApproveSubscriptionSchema>;
