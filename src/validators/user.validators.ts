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

export const UserActionSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required'),
  
  action: z
    .enum(['approve', 'reject']),
});

export const UserLoginSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email must not exceed 255 characters'),
  
  password: z
    .string()
    .min(1, 'Password is required'),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z
    .string()
    .optional(),
  
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .toLowerCase()
    .max(255, 'Email must not exceed 255 characters'),
});

export const ResetPasswordSchema = z.object({
  token: z
    .string()
    .min(1, 'Token is required'),
  
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

export type ContactFormDto = z.infer<typeof ContactFormSchema>;
export type PaginationQueryDto = z.infer<typeof PaginationQuerySchema>;
export type UserActionDto = z.infer<typeof UserActionSchema>;
export type UserLoginDto = z.infer<typeof UserLoginSchema>;
export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
