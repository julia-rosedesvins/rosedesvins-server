import { z } from 'zod';

export const CreateSupportContactSchema = z.object({
  subject: z
    .string()
    .min(3, 'Subject must be at least 3 characters')
    .max(200, 'Subject must not exceed 200 characters')
    .trim(),
  
  message: z
    .string()
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message must not exceed 2000 characters')
    .trim(),
});

export type CreateSupportContactDto = z.infer<typeof CreateSupportContactSchema>;

export const PaginationQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => val > 0, 'Page must be greater than 0'),
  
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine((val) => val > 0 && val <= 50, 'Limit must be between 1 and 50'),
});

export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;

export const UpdateTicketStatusSchema = z.object({
  ticketId: z
    .string()
    .min(1, 'Ticket ID is required')
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ticket ID format'),
  
  status: z.enum(['pending', 'in-progress', 'resolved', 'closed'], {
    message: 'Status must be one of: pending, in-progress, resolved, closed',
  }),
});

export type UpdateTicketStatusDto = z.infer<typeof UpdateTicketStatusSchema>;