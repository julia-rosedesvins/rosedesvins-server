import { z } from 'zod';

// Import the payment method options from the schema
import { PAYMENT_METHOD_OPTIONS } from '../schemas/payment-methods.schema';

export const CreateOrUpdatePaymentMethodsSchema = z.object({
  methods: z
    .array(
      z.enum([
        PAYMENT_METHOD_OPTIONS.BANK_CARD,
        PAYMENT_METHOD_OPTIONS.CHECKS,
        PAYMENT_METHOD_OPTIONS.CASH
      ] as const)
    )
    .min(0, 'Methods array cannot be empty')
    .max(3, 'Cannot have more than 3 payment methods')
    .optional()
    .default([]),
});

export type CreateOrUpdatePaymentMethodsDto = z.infer<typeof CreateOrUpdatePaymentMethodsSchema>;
