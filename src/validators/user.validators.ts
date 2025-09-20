import { z } from 'zod';

export const ContactFormSchema = z.object({
  firstName: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
  
  lastName: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
  
  email: z
    .string()
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email must not exceed 255 characters'),
  
  domainName: z
    .string()
    .min(2, 'Domain name must be at least 2 characters')
    .max(100, 'Domain name must not exceed 100 characters')
    .trim(),
});

export const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 1)
    .refine((val) => val >= 1, 'Page must be greater than 0'),
  
  limit: z
    .string()
    .optional()
    .transform((val) => val ? parseInt(val, 10) : 10)
    .refine((val) => val >= 1 && val <= 50, 'Limit must be between 1 and 50'),
});

export type ContactFormDto = z.infer<typeof ContactFormSchema>;
export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;
