import { z } from 'zod';

export const SendTestEmailSchema = z.object({
  to: z.email('Invalid email address'),
  locale: z.enum(['fr', 'en']).optional(),
});

export type SendTestEmailDto = z.infer<typeof SendTestEmailSchema>;
