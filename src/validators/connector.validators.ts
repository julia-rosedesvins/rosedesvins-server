import { z } from 'zod';

export const OrangeConnectorSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(100, 'Username must not exceed 100 characters')
    .trim(),
  
  password: z
    .string()
    .min(1, 'Password is required')
    .max(255, 'Password must not exceed 255 characters'),
});

export type OrangeConnectorDto = z.infer<typeof OrangeConnectorSchema>;
