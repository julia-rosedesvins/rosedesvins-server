import { Injectable, HttpException, HttpStatus, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserBooking } from '../schemas/user-bookings.schema';
import { User } from '../schemas/user.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { Subscription } from '../schemas/subscriptions.schema';
import { CreateBookingDto } from '../validators/user-bookings.validators';

@Injectable()
export class UserBookingsService {
  constructor(
    @InjectModel(UserBooking.name) private userBookingModel: Model<UserBooking>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
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
