import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

// Payment method sub-schema for bank card details
@Schema({ _id: false })
export class BankCardDetails {
  @Prop({ required: true, trim: true })
  bankName: string;

  @Prop({ required: true, trim: true })
  accountName: string;

  @Prop({ required: true, trim: true })
  accountNumber: string;
}

export const BankCardDetailsSchema = SchemaFactory.createForClass(BankCardDetails);

// Payment method sub-schema for cheque details
@Schema({ _id: false })
export class ChequeDetails {
  @Prop({ required: true, trim: true })
  chequeNumber: string;

  @Prop({ required: true, trim: true })
  bankName: string;

  @Prop({ required: true, type: Date })
  issueDate: Date;
}

export const ChequeDetailsSchema = SchemaFactory.createForClass(ChequeDetails);

// Payment method sub-schema
@Schema({ _id: false })
export class PaymentMethodDetails {
  @Prop({ 
    required: true, 
    enum: ['bank_card', 'cheque', 'stripe', 'cash_on_onsite'],
    lowercase: true 
  })
  method: string;

  @Prop({ type: BankCardDetailsSchema, required: false })
  bankCardDetails?: BankCardDetails;

  @Prop({ type: ChequeDetailsSchema, required: false })
  chequeDetails?: ChequeDetails;

  // For stripe and cash_on_onsite, just the method name is stored
  // All details will be null for these methods
}

export const PaymentMethodDetailsSchema = SchemaFactory.createForClass(PaymentMethodDetails);

// Main user booking schema
@Schema({ 
  timestamps: true,
  collection: 'user-bookings' 
})
export class UserBooking extends Document {
  @Prop({ 
    type: Types.ObjectId, 
    ref: User.name, 
    required: true,
    index: true 
  })
  userId: Types.ObjectId;

  @Prop({ 
    type: Types.ObjectId, 
    required: true,
    index: true 
  })
  serviceId: Types.ObjectId; // References service from domain-profile services array

  @Prop({ 
    type: Date, 
    required: true,
    index: true 
  })
  bookingDate: Date; // selected_date

  @Prop({ 
    required: true, 
    trim: true,
    match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/ // HH:MM format validation
  })
  bookingTime: string; // selected_time in HH:MM format

  @Prop({ 
    required: true, 
    min: 0,
    default: 0 
  })
  participantsAdults: number;

  @Prop({ 
    required: true, 
    min: 0,
    default: 0 
  })
  participantsEnfants: number;

  @Prop({ 
    required: true, 
    trim: true 
  })
  selectedLanguage: string;

  @Prop({ 
    required: true, 
    trim: true,
    minlength: 2,
    maxlength: 50 
  })
  userContactFirstname: string;

  @Prop({ 
    required: true, 
    trim: true,
    minlength: 2,
    maxlength: 50 
  })
  userContactLastname: string;

  @Prop({ 
    required: true, 
    trim: true,
    minlength: 9,
    maxlength: 20 
  })
  phoneNo: string; // Phone number with country code as string (e.g., "+33123456789")

  @Prop({ 
    required: true, 
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ // Email validation regex
  })
  customerEmail: string; // Customer's email address for booking notifications

  @Prop({ 
    trim: true,
    maxlength: 1000 
  })
  additionalNotes?: string; // Optional field

  @Prop({ 
    type: PaymentMethodDetailsSchema, 
    required: true 
  })
  paymentMethod: PaymentMethodDetails;

  @Prop({ 
    required: true,
    enum: [
      'pending',           // Initial booking state
      'confirmed',         // Booking confirmed by admin/system
      'cancelled',         // Booking cancelled by user or admin
      'completed',         // Service completed
      'no_show',          // User didn't show up
      'payment_pending',   // Awaiting payment
      'payment_failed',    // Payment failed
      'refunded',          // Booking refunded
      'cancelled_by_guest'   // Booking cancelled by guest user
    ],
    default: 'pending',
    lowercase: true,
    index: true
  })
  bookingStatus: string;

  // Calendar integration fields
  @Prop({ 
    type: String,
    required: false,
    trim: true
  })
  microsoftEventId?: string; // Microsoft Graph API event ID for calendar integration

  @Prop({ 
    type: String,
    required: false,
    trim: true
  })
  googleEventId?: string; // Google Calendar API event ID for calendar integration

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const UserBookingSchema = SchemaFactory.createForClass(UserBooking);

// Create indexes for better performance
UserBookingSchema.index({ userId: 1, bookingDate: 1 }); // Query bookings by user and date
UserBookingSchema.index({ serviceId: 1, bookingDate: 1 }); // Query bookings by service and date
UserBookingSchema.index({ bookingStatus: 1, bookingDate: 1 }); // Query by status and date
UserBookingSchema.index({ createdAt: -1 }); // Sort by creation date
UserBookingSchema.index({ 
  userId: 1, 
  serviceId: 1, 
  bookingDate: 1, 
  bookingTime: 1 
}, { 
  unique: true,
  name: 'unique_booking_slot'
}); // Prevent duplicate bookings for same user, service, date, and time
