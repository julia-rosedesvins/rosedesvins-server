import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';
import { UserBooking } from './user-bookings.schema';

@Schema({ 
  timestamps: true,
  collection: 'events' 
})
export class Event extends Document {
  @Prop({ 
    type: Types.ObjectId, 
    ref: User.name, 
    required: true,
    index: true 
  })
  userId: Types.ObjectId; // Owner of the event/calendar

  @Prop({ 
    type: Types.ObjectId, 
    ref: UserBooking.name, 
    required: false,
    index: true 
  })
  bookingId?: Types.ObjectId; // Reference to user-booking if this event is from a booking

  @Prop({ 
    required: true, 
    trim: true,
    minlength: 1,
    maxlength: 200 
  })
  eventName: string;

  @Prop({ 
    type: Date, 
    required: true,
    index: true 
  })
  eventDate: Date;

  @Prop({ 
    required: true, 
    trim: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format validation
  })
  eventTime: string; // Start time in HH:MM format

  @Prop({ 
    trim: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format validation
  })
  eventEndTime?: string; // End time in HH:MM format (optional for all-day events)

  @Prop({ 
    trim: true,
    maxlength: 1000 
  })
  eventDescription?: string; // Optional description

  @Prop({ 
    required: true,
    enum: [
      'booking',        // Event created from user-booking
      'personal',       // Personal event added manually
      'external',       // Event imported from external calendar (Orange, Google, etc.)
      'blocked'         // Time slot blocked for maintenance, holidays, etc.
    ],
    default: 'personal',
    lowercase: true,
    index: true
  })
  eventType: string;

  @Prop({ 
    trim: true,
    maxlength: 50 
  })
  externalCalendarSource?: string; // e.g., 'orange', 'google', 'outlook'

  @Prop({ 
    trim: true 
  })
  externalEventId?: string; // Original event ID from external calendar for sync

  @Prop({ 
    required: true,
    enum: [
      'active',         // Event is active
      'cancelled',      // Event cancelled
      'completed',      // Event completed
      'rescheduled'     // Event was rescheduled (new event created)
    ],
    default: 'active',
    lowercase: true,
    index: true
  })
  eventStatus: string;

  @Prop({ 
    required: true,
    default: false
  })
  isAllDay: boolean; // For all-day events

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const EventSchema = SchemaFactory.createForClass(Event);

// Create indexes for better performance
EventSchema.index({ userId: 1, eventDate: 1 }); // Query events by user and date
EventSchema.index({ eventDate: 1, eventTime: 1 }); // Query events by date and time
EventSchema.index({ eventType: 1, eventStatus: 1 }); // Query by type and status
EventSchema.index({ bookingId: 1 }, { sparse: true }); // Query by booking ID (sparse for null values)
EventSchema.index({ externalEventId: 1 }, { sparse: true }); // Query by external event ID
EventSchema.index({ 
  userId: 1, 
  eventDate: 1, 
  eventTime: 1,
  eventType: 1 
}, { 
  name: 'user_datetime_type_index' 
}); // Composite index for calendar queries
EventSchema.index({ createdAt: -1 }); // Sort by creation date
