import { z } from 'zod';

// Time slot validation schema
export const TimeSlotSchema = z.object({
  startTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm format (24-hour)'),
  
  endTime: z
    .string()
    .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format. Use HH:mm format (24-hour)'),
}).refine(
  (data) => {
    const [startHour, startMin] = data.startTime.split(':').map(Number);
    const [endHour, endMin] = data.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return endMinutes > startMinutes;
  },
  { message: 'End time must be after start time' }
);

// Daily availability validation schema
export const DayAvailabilitySchema = z.object({
  isAvailable: z.boolean().default(true),
  timeSlots: z.array(TimeSlotSchema).default([]),
});

// Weekly availability validation schema
export const WeeklyAvailabilitySchema = z.object({
  monday: DayAvailabilitySchema.default({ isAvailable: true, timeSlots: [] }),
  tuesday: DayAvailabilitySchema.default({ isAvailable: true, timeSlots: [] }),
  wednesday: DayAvailabilitySchema.default({ isAvailable: true, timeSlots: [] }),
  thursday: DayAvailabilitySchema.default({ isAvailable: true, timeSlots: [] }),
  friday: DayAvailabilitySchema.default({ isAvailable: true, timeSlots: [] }),
  saturday: DayAvailabilitySchema.default({ isAvailable: true, timeSlots: [] }),
  sunday: DayAvailabilitySchema.default({ isAvailable: true, timeSlots: [] }),
});

// Public holiday validation schema
export const PublicHolidaySchema = z.object({
  name: z
    .string()
    .min(1, 'Holiday name is required')
    .max(100, 'Holiday name must not exceed 100 characters'),
  
  date: z
    .string()
    .datetime('Invalid date format')
    .transform((str) => new Date(str)),
  
  isBlocked: z.boolean().default(true),
  isRecurring: z.boolean().default(false),
  description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
});

// Special date availability override validation schema
export const SpecialDateAvailabilitySchema = z.object({
  date: z
    .string()
    .datetime('Invalid date format')
    .transform((str) => new Date(str)),
  
  isAvailable: z.boolean(),
  timeSlots: z.array(TimeSlotSchema).default([]),
  reason: z.string().max(200, 'Reason must not exceed 200 characters').optional(),
});

// Main availability save schema
export const SaveAvailabilitySchema = z.object({
  weeklyAvailability: WeeklyAvailabilitySchema,
  
  publicHolidays: z.array(PublicHolidaySchema).default([]),
  
  specialDateOverrides: z.array(SpecialDateAvailabilitySchema).default([]),
  
  timezone: z
    .string()
    .min(1, 'Timezone is required')
    .default('Europe/Paris'),
  
  defaultSlotDuration: z
    .number()
    .int('Slot duration must be an integer')
    .min(5, 'Minimum slot duration is 5 minutes')
    .max(480, 'Maximum slot duration is 480 minutes (8 hours)')
    .default(30),
  
  bufferTime: z
    .number()
    .int('Buffer time must be an integer')
    .min(0, 'Buffer time cannot be negative')
    .max(120, 'Maximum buffer time is 120 minutes')
    .default(0),
  
  isActive: z.boolean().default(true),
});

export type TimeSlotDto = z.infer<typeof TimeSlotSchema>;
export type DayAvailabilityDto = z.infer<typeof DayAvailabilitySchema>;
export type WeeklyAvailabilityDto = z.infer<typeof WeeklyAvailabilitySchema>;
export type PublicHolidayDto = z.infer<typeof PublicHolidaySchema>;
export type SpecialDateAvailabilityDto = z.infer<typeof SpecialDateAvailabilitySchema>;
export type SaveAvailabilityDto = z.infer<typeof SaveAvailabilitySchema>;
