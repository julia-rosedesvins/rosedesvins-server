import { z } from 'zod';

export const SendTestEmailSchema = z.object({
  to: z.email('Invalid email address'),
});

export type SendTestEmailDto = z.infer<typeof SendTestEmailSchema>;
