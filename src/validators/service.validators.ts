import { z } from 'zod';

export const ServiceSchema = z.object({
  serviceName: z
    .string()
    .min(2, 'Service name must be at least 2 characters')
    .max(100, 'Service name must not exceed 100 characters')
    .trim(),
  
  serviceDescription: z
    .string()
    .min(10, 'Service description must be at least 10 characters')
    .max(1000, 'Service description must not exceed 1000 characters')
    .trim(),
  
  numberOfPeople: z
    .string()
    .regex(/^[0-9]+(\-[0-9]+)?$/, 'Number of people must be a number or range (e.g., "1", "2-8", "10")')
    .min(1, 'Number of people is required'),
  
  pricePerPerson: z
    .number()
    .min(0, 'Price per person must be 0 or greater')
    .max(10000, 'Price per person must not exceed 10,000'),
  
  timeOfServiceInMinutes: z
    .number()
    .int('Time of service must be an integer')
    .min(15, 'Time of service must be at least 15 minutes')
    .max(1440, 'Time of service must not exceed 24 hours (1440 minutes)'),
  
  numberOfWinesTasted: z
    .number()
    .int('Number of wines must be an integer')
    .min(0, 'Number of wines must be 0 or greater'),
  
  languagesOffered: z
    .array(z.string().min(2, 'Language must be at least 2 characters'))
    .min(1, 'At least one language must be offered')
    .max(10, 'Maximum 10 languages allowed'),
  
  isActive: z
    .boolean()
    .default(true)
});

export const UpdateServiceSchema = z.object({
  serviceName: z
    .string()
    .min(2, 'Service name must be at least 2 characters')
    .max(100, 'Service name must not exceed 100 characters')
    .trim()
    .optional(),
  
  serviceDescription: z
    .string()
    .min(10, 'Service description must be at least 10 characters')
    .max(1000, 'Service description must not exceed 1000 characters')
    .trim()
    .optional(),
  
  numberOfPeople: z
    .string()
    .regex(/^[0-9]+(\-[0-9]+)?$/, 'Number of people must be a number or range (e.g., "1", "2-8", "10")')
    .min(1, 'Number of people is required')
    .optional(),
  
  pricePerPerson: z
    .number()
    .min(0, 'Price per person must be 0 or greater')
    .max(10000, 'Price per person must not exceed 10,000')
    .optional(),
  
  timeOfServiceInMinutes: z
    .number()
    .int('Time of service must be an integer')
    .min(15, 'Time of service must be at least 15 minutes')
    .max(1440, 'Time of service must not exceed 24 hours (1440 minutes)')
    .optional(),
  
  numberOfWinesTasted: z
    .number()
    .int('Number of wines must be an integer')
    .min(0, 'Number of wines must be 0 or greater')
    .optional(),
  
  languagesOffered: z
    .array(z.string().min(2, 'Language must be at least 2 characters'))
    .min(1, 'At least one language must be offered')
    .max(10, 'Maximum 10 languages allowed')
    .optional(),
  
  isActive: z
    .boolean()
    .optional()
});

export type CreateServiceDto = z.infer<typeof ServiceSchema>;
export type UpdateServiceDto = z.infer<typeof UpdateServiceSchema>;
