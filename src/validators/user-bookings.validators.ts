import { z } from 'zod';
import { Types } from 'mongoose';

// Payment method validation schemas
export const BankCardDetailsSchema = z.object({
  bankName: z
    .string()
    .min(2, 'Bank name must be at least 2 characters')
    .max(100, 'Bank name must not exceed 100 characters')
    .trim(),
  
  accountName: z
    .string()
    .min(2, 'Account name must be at least 2 characters')
    .max(100, 'Account name must not exceed 100 characters')
    .trim(),
  
  accountNumber: z
    .string()
    .min(5, 'Account number must be at least 5 characters')
    .max(50, 'Account number must not exceed 50 characters')
    .trim(),
});

export const ChequeDetailsSchema = z.object({
  chequeNumber: z
    .string()
    .min(1, 'Cheque number is required')
    .max(50, 'Cheque number must not exceed 50 characters')
    .trim(),
  
  bankName: z
    .string()
    .min(2, 'Bank name must be at least 2 characters')
    .max(100, 'Bank name must not exceed 100 characters')
    .trim(),
  
  issueDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid issue date format')
    .transform((val) => new Date(val)),
});

export const PaymentMethodSchema = z.object({
  method: z
    .enum(['bank_card', 'cheque', 'stripe', 'cash_on_onsite'])
    .refine((val) => val !== undefined, 'Payment method is required'),
  
  bankCardDetails: z.optional(BankCardDetailsSchema),
  chequeDetails: z.optional(ChequeDetailsSchema),
}).refine((data) => {
  // Validate required fields based on payment method
  if (data.method === 'bank_card' && !data.bankCardDetails) {
    return false;
  }
  if (data.method === 'cheque' && !data.chequeDetails) {
    return false;
  }
  // stripe and cash_on_onsite don't require additional details
  return true;
}, {
  message: 'Payment method details are required for the selected payment method',
  path: ['paymentMethod']
});

export const CreateBookingSchema = z.object({
  userId: z
    .string()
    .min(1, 'User ID is required')
    .refine((val) => Types.ObjectId.isValid(val), 'Invalid user ID format'),
  
  serviceId: z
    .string()
    .min(1, 'Service ID is required')
    .refine((val) => Types.ObjectId.isValid(val), 'Invalid service ID format'),
  
  bookingDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid booking date format')
    .transform((val) => {
      // Handle both ISO string and YYYY-MM-DD formats properly
      if (val.includes('T')) {
        // Already has time information (ISO string format)
        return new Date(val);
      } else {
        // Just date string (YYYY-MM-DD format), create date at midnight UTC
        return new Date(val + 'T00:00:00.000Z');
      }
    }),
  
  bookingTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Booking time must be in HH:MM format'),
  
  participantsAdults: z
    .number()
    .min(0, 'Adults count cannot be negative')
    .max(50, 'Adults count cannot exceed 50'),
  
  participantsEnfants: z
    .number()
    .min(0, 'Children count cannot be negative')
    .max(50, 'Children count cannot exceed 50'),
  
  selectedLanguage: z
    .string()
    .min(2, 'Selected language must be at least 2 characters')
    .max(50, 'Selected language must not exceed 50 characters')
    .trim(),
  
  userContactFirstname: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
    .trim(),
  
  userContactLastname: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
    .trim(),
  
  phoneNo: z
    .string()
    .min(9, 'Phone number must be at least 9 characters')
    .max(20, 'Phone number must not exceed 20 characters')
    .trim(),
  
  customerEmail: z
    .string()
    .email('Invalid email format')
    .min(5, 'Email must be at least 5 characters')
    .max(255, 'Email must not exceed 255 characters')
    .trim()
    .toLowerCase(),
  
  additionalNotes: z
    .string()
    .max(1000, 'Additional notes must not exceed 1000 characters')
    .trim()
    .optional(),
  
  paymentMethod: PaymentMethodSchema,
})
.refine((data) => {
  return data.participantsAdults + data.participantsEnfants > 0;
}, {
  message: 'Total participants (adults + children) must be at least 1',
  path: ['participantsAdults'],
});

// Update booking schema - all fields are optional for partial updates
export const UpdateBookingSchema = z.object({
  serviceId: z
    .string()
    .refine((val) => Types.ObjectId.isValid(val), 'Invalid service ID format')
    .optional(),
  
  bookingDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid booking date format')
    .transform((val) => {
      if (val.includes('T')) {
        return new Date(val);
      } else {
        return new Date(val + 'T00:00:00.000Z');
      }
    })
    .optional(),
  
  bookingTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Booking time must be in HH:MM format')
    .optional(),
  
  participantsAdults: z
    .number()
    .min(0, 'Adults count cannot be negative')
    .max(50, 'Adults count cannot exceed 50')
    .optional(),
  
  participantsEnfants: z
    .number()
    .min(0, 'Children count cannot be negative')
    .max(50, 'Children count cannot exceed 50')
    .optional(),
  
  selectedLanguage: z
    .string()
    .min(2, 'Selected language must be at least 2 characters')
    .max(50, 'Selected language must not exceed 50 characters')
    .trim()
    .optional(),
  
  userContactFirstname: z
    .string()
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes')
    .trim()
    .optional(),
  
  userContactLastname: z
    .string()
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes')
    .trim()
    .optional(),
  
  phoneNo: z
    .string()
    .min(9, 'Phone number must be at least 9 characters')
    .max(20, 'Phone number must not exceed 20 characters')
    .trim()
    .optional(),
  
  customerEmail: z
    .string()
    .email('Invalid email format')
    .min(5, 'Email must be at least 5 characters')
    .max(255, 'Email must not exceed 255 characters')
    .trim()
    .toLowerCase()
    .optional(),
  
  additionalNotes: z
    .string()
    .max(1000, 'Additional notes must not exceed 1000 characters')
    .trim()
    .optional(),
  
  paymentMethod: PaymentMethodSchema.optional(),

  bookingStatus: z
    .enum(['pending', 'confirmed', 'completed', 'cancelled'])
    .optional(),
})
.refine((data) => {
  // If both participant counts are provided, ensure total > 0
  if (data.participantsAdults !== undefined && data.participantsEnfants !== undefined) {
    return data.participantsAdults + data.participantsEnfants > 0;
  }
  return true;
}, {
  message: 'Total participants (adults + children) must be at least 1',
  path: ['participantsAdults'],
});

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;
export type UpdateBookingDto = z.infer<typeof UpdateBookingSchema>;
export type PaymentMethodDto = z.infer<typeof PaymentMethodSchema>;
export type BankCardDetailsDto = z.infer<typeof BankCardDetailsSchema>;
export type ChequeDetailsDto = z.infer<typeof ChequeDetailsSchema>;
