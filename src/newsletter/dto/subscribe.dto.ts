import { z } from 'zod';

export const SubscribeSchema = z.object({
  email: z.string().email('Email invalide'),
});

export type SubscribeDto = z.infer<typeof SubscribeSchema>;
