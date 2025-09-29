import { Injectable, HttpException, HttpStatus, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserBooking } from '../schemas/user-bookings.schema';
import { User } from '../schemas/user.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { Subscription } from '../schemas/subscriptions.schema';
import { Event } from '../schemas/events.schema';
import { CreateBookingDto } from '../validators/user-bookings.validators';

@Injectable()
export class UserBookingsService {
  constructor(
    @InjectModel(UserBooking.name) private userBookingModel: Model<UserBooking>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
  ) {}

  async createBooking(createBookingDto: CreateBookingDto): Promise<UserBooking> {
    try {
      // Convert string IDs to ObjectIds
      const userObjectId = new Types.ObjectId(createBookingDto.userId);
      const serviceObjectId = new Types.ObjectId(createBookingDto.serviceId);

      // Create booking data with proper field mapping
      const bookingData = {
        userId: userObjectId,
        serviceId: serviceObjectId,
        bookingDate: new Date(createBookingDto.bookingDate),
        bookingTime: createBookingDto.bookingTime,
        participantsAdults: createBookingDto.participantsAdults,
        participantsEnfants: createBookingDto.participantsEnfants,
        selectedLanguage: createBookingDto.selectedLanguage,
        userContactFirstname: createBookingDto.userContactFirstname,
        userContactLastname: createBookingDto.userContactLastname,
        phoneNo: createBookingDto.phoneNo,
        additionalNotes: createBookingDto.additionalNotes,
        paymentMethod: createBookingDto.paymentMethod,
        bookingStatus: 'pending', // Default status
      };

      // Create and save the booking
      const newBooking = new this.userBookingModel(bookingData);
      const savedBooking = await newBooking.save();

      if (!savedBooking) {
        throw new BadRequestException('Failed to create booking');
      }

      // Create corresponding event in events table
      try {
        const eventData = {
          userId: userObjectId, // The wine business owner who receives the booking
          bookingId: savedBooking._id, // Reference to the created booking
          eventName: `Booking: ${createBookingDto.userContactFirstname} ${createBookingDto.userContactLastname}`,
          eventDate: new Date(createBookingDto.bookingDate),
          eventTime: createBookingDto.bookingTime,
          eventDescription: createBookingDto.additionalNotes || `Wine tasting booking for ${createBookingDto.participantsAdults + createBookingDto.participantsEnfants} people`,
          eventType: 'booking', // This is a booking-related event
          eventStatus: 'active', // Default status for new events
          isAllDay: false, // Bookings are time-specific
        };

        const newEvent = new this.eventModel(eventData);
        await newEvent.save();
        
        console.log('Successfully created event for booking:', savedBooking._id);
      } catch (eventError) {
        console.error('Failed to create event for booking:', eventError);
        // Log the error but don't fail the booking creation
        // The booking is more critical than the calendar event
      }

      return savedBooking;
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key error (unique constraint violation)
        throw new ConflictException('A booking already exists for this time slot');
      }
      
      if (error instanceof BadRequestException || error instanceof ConflictException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to create booking');
    }
  }
}
