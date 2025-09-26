import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

// Time slot sub-schema for availability periods
@Schema({ _id: false })
export class TimeSlot {
  @Prop({ required: true, match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ })
  startTime: string; // Format: "HH:mm" (24-hour format)

  @Prop({ required: true, match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ })
  endTime: string; // Format: "HH:mm" (24-hour format)
}

export const TimeSlotSchema = SchemaFactory.createForClass(TimeSlot);

// Daily availability sub-schema
@Schema({ _id: false })
export class DayAvailability {
  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ type: [TimeSlotSchema], default: [] })
  timeSlots: TimeSlot[];
}

export const DayAvailabilitySchema = SchemaFactory.createForClass(DayAvailability);

// Weekly availability sub-schema
@Schema({ _id: false })
export class WeeklyAvailability {
  @Prop({ type: DayAvailabilitySchema, default: () => ({ isAvailable: true, timeSlots: [] }) })
  monday: DayAvailability;

  @Prop({ type: DayAvailabilitySchema, default: () => ({ isAvailable: true, timeSlots: [] }) })
  tuesday: DayAvailability;

  @Prop({ type: DayAvailabilitySchema, default: () => ({ isAvailable: true, timeSlots: [] }) })
  wednesday: DayAvailability;

  @Prop({ type: DayAvailabilitySchema, default: () => ({ isAvailable: true, timeSlots: [] }) })
  thursday: DayAvailability;

  @Prop({ type: DayAvailabilitySchema, default: () => ({ isAvailable: true, timeSlots: [] }) })
  friday: DayAvailability;

  @Prop({ type: DayAvailabilitySchema, default: () => ({ isAvailable: true, timeSlots: [] }) })
  saturday: DayAvailability;

  @Prop({ type: DayAvailabilitySchema, default: () => ({ isAvailable: true, timeSlots: [] }) })
  sunday: DayAvailability;
}

export const WeeklyAvailabilitySchema = SchemaFactory.createForClass(WeeklyAvailability);

// Public holiday sub-schema
@Schema({ _id: false })
export class PublicHoliday {
  @Prop({ required: true })
  name: string; // e.g., "Christmas Day", "New Year's Day"

  @Prop({ required: true })
  date: Date; // Specific date of the holiday

  @Prop({ default: true })
  isBlocked: boolean; // Whether this holiday blocks availability

  @Prop({ default: false })
  isRecurring: boolean; // Whether this holiday repeats annually

  @Prop()
  description?: string; // Optional description of the holiday
}

export const PublicHolidaySchema = SchemaFactory.createForClass(PublicHoliday);

// Special date availability override sub-schema
@Schema({ _id: false })
export class SpecialDateAvailability {
  @Prop({ required: true })
  date: Date; // Specific date for override

  @Prop({ required: true })
  isAvailable: boolean;

  @Prop({ type: [TimeSlotSchema], default: [] })
  timeSlots: TimeSlot[]; // Custom time slots for this specific date

  @Prop()
  reason?: string; // Optional reason for the override
}

export const SpecialDateAvailabilitySchema = SchemaFactory.createForClass(SpecialDateAvailability);

// Main availability schema
@Schema({ timestamps: true })
export class Availability extends Document {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: WeeklyAvailabilitySchema, required: true })
  weeklyAvailability: WeeklyAvailability;

  @Prop({ type: [PublicHolidaySchema], default: [] })
  publicHolidays: PublicHoliday[];

  @Prop({ type: [SpecialDateAvailabilitySchema], default: [] })
  specialDateOverrides: SpecialDateAvailability[];

  @Prop({ default: 'Europe/Paris' })
  timezone: string; // User's timezone for availability calculations

  @Prop({ default: 30 })
  defaultSlotDuration: number; // Default appointment duration in minutes

  @Prop({ default: 0 })
  bufferTime: number; // Buffer time between appointments in minutes

  @Prop({ default: true })
  isActive: boolean; // Whether availability settings are active

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const AvailabilitySchema = SchemaFactory.createForClass(Availability);

// Create indexes for better performance
AvailabilitySchema.index({ userId: 1 });
AvailabilitySchema.index({ 'publicHolidays.date': 1 });
AvailabilitySchema.index({ 'specialDateOverrides.date': 1 });
AvailabilitySchema.index({ isActive: 1 });
