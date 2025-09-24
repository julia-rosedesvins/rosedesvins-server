import { z } from 'zod';

const ServiceSchema = z.object({
  name: z
    .string()
    .min(2, 'Service name must be at least 2 characters')
    .max(100, 'Service name must not exceed 100 characters')
    .trim(),
  
  description: z
    .string()
    .min(10, 'Service description must be at least 10 characters')
    .max(1000, 'Service description must not exceed 1000 characters')
    .trim(),
  
  numberOfPeople: z
    .number()
    .int('Number of people must be an integer')
    .min(1, 'Number of people must be at least 1')
    .max(100, 'Number of people must not exceed 100'),
  
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
    .min(2, 'Domain name must be at least 2 characters')
    .max(100, 'Domain name must not exceed 100 characters')
    .trim(),
  
  domainDescription: z
    .string()
    .min(10, 'Domain description must be at least 10 characters')
    .max(2000, 'Domain description must not exceed 2000 characters')
    .trim(),
  
  domainProfilePictureUrl: z
    .string()
    .url('Invalid profile picture URL')
    .max(500, 'Profile picture URL must not exceed 500 characters')
    .optional(),
  
  domainLogoUrl: z
    .string()
    .url('Invalid logo URL')
    .max(500, 'Logo URL must not exceed 500 characters')
    .optional(),
  
  colorCode: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Color code must be a valid hex color (e.g., #3A7B59 or #FFF)')
    .default('#3A7B59'),
  
  services: z
    .array(ServiceSchema)
    .max(20, 'Maximum 20 services allowed')
    .default([])
});

export type CreateOrUpdateDomainProfileDto = z.infer<typeof CreateOrUpdateDomainProfileSchema>;
export type ServiceDto = z.infer<typeof ServiceSchema>;
