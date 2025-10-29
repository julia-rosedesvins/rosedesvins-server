import { z } from 'zod';

const ServiceSchema = z.object({
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

export const CreateOrUpdateDomainProfileSchema = z.object({
  domainName: z
    .string()
    .max(100, 'Domain name must not exceed 100 characters')
    .trim()
    .optional(),
  
  domainDescription: z
    .string()
    .max(2000, 'Domain description must not exceed 2000 characters')
    .trim()
    .optional(),

  domainType: z
    .string()
    .max(100, 'Domain type must not exceed 100 characters')
    .trim()
    .optional(),

  domainTag: z
    .string()
    .max(100, 'Domain tag must not exceed 100 characters')
    .trim()
    .optional(),
  
  domainProfilePictureUrl: z
    .string()
    .max(500, 'Profile picture URL must not exceed 500 characters')
    .optional(),
  
  domainLogoUrl: z
    .string()
    .max(500, 'Logo URL must not exceed 500 characters')
    .optional(),
  
  domainColor: z
    .string()
    .optional()
});

export type CreateOrUpdateDomainProfileDto = z.infer<typeof CreateOrUpdateDomainProfileSchema>;
export type ServiceDto = z.infer<typeof ServiceSchema>;
