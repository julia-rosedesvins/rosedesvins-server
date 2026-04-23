import { z } from 'zod';

// Import the payment method options from the schema
import { PAYMENT_METHOD_OPTIONS } from '../schemas/payment-methods.schema';

const CANCELLATION_POLICY_OPTIONS = [
  'none',
  '24h',
  '48h',
  '72h',
  '1_week',
] as const;

export const CreateOrUpdatePaymentMethodsSchema = z.object({
  methods: z
    .array(
      z.enum([
        PAYMENT_METHOD_OPTIONS.BANK_CARD,
        PAYMENT_METHOD_OPTIONS.CHECKS,
        PAYMENT_METHOD_OPTIONS.CASH,
        PAYMENT_METHOD_OPTIONS.STRIPE,
      ] as const)
    )
    .min(0, 'Methods array cannot be empty')
    .max(4, 'Cannot have more than 4 payment methods')
    .optional()
    .default([]),
  cancellationPolicy: z.enum(CANCELLATION_POLICY_OPTIONS).nullable().optional(),
});

export type CreateOrUpdatePaymentMethodsDto = z.infer<typeof CreateOrUpdatePaymentMethodsSchema>;
