import { Injectable, BadRequestException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
import ical from 'ical-generator';

import { UserBooking } from '../schemas/user-bookings.schema';
import { User } from '../schemas/user.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { Subscription } from '../schemas/subscriptions.schema';
import { Event } from '../schemas/events.schema';
import { Connector } from '../schemas/connector.schema';
import { CreateBookingDto } from '../validators/user-bookings.validators';
import { EncryptionService } from '../common/encryption.service';

const dav = require('dav');

/**
 * Service for managing wine tasting bookings and calendar integrations
 * Supports Orange Mail calendar integration with automatic event creation
 */
@Injectable()
export class UserBookingsService {
  private calendarCache = new Map<string, { calendar: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(
    @InjectModel(UserBooking.name) private userBookingModel: Model<UserBooking>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
  ) {}

  async createBooking(createBookingDto: CreateBookingDto): Promise<UserBooking> {
    try {
      // Convert string IDs to ObjectIds
      const userObjectId = new Types.ObjectId(createBookingDto.userId);
      const serviceObjectId = new Types.ObjectId(createBookingDto.serviceId);

      // Create booking data with proper field mapping
      const parsedDate = createBookingDto.bookingDate;
      
      const bookingData = {
        userId: userObjectId,
        serviceId: serviceObjectId,
        bookingDate: parsedDate,
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
          eventDate: parsedDate, // Use the same parsed date
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

      // Add calendar integration using setImmediate (non-blocking)
      setImmediate(() => {
        this.addToCalendar(savedBooking, createBookingDto).catch(error => {
          console.error('Failed to add booking to calendar:', error);
        });
      });

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

  /**
   * Add booking event to user's active calendar
   */
  private async addToCalendar(booking: UserBooking, bookingDto: CreateBookingDto): Promise<void> {
    try {
      console.log('🔗 Starting calendar integration for booking:', booking._id);

      // Check which calendar connectors are available and active for this user
      const connectors = await this.connectorModel
        .find({ 
          userId: booking.userId
        })
        .exec();

      if (!connectors || connectors.length === 0) {
        console.log('ℹ️ No calendar connectors found for user:', booking.userId);
        return;
      }

      // Check for active Orange connector
      const orangeConnector = connectors.find(conn => 
        conn.connector_name === 'orange' && 
        conn.connector_creds?.orange?.isActive && 
        conn.connector_creds?.orange?.isValid
      );

      if (orangeConnector?.connector_creds?.orange) {
        console.log('🍊 Using Orange calendar for user:', booking.userId);
        await this.addToOrangeCalendar(booking, bookingDto, orangeConnector.connector_creds.orange);
        return;
      }

      // TODO: Add support for Microsoft and OVH calendar providers
      console.log('ℹ️ No active calendar connectors found for user:', booking.userId);
      
    } catch (error) {
      console.error('❌ Calendar integration error:', error);
      // Non-blocking: Calendar integration failure shouldn't prevent booking creation
    }
  }

  /**
   * Add booking event to Orange Mail calendar using CalDAV
   * Creates a wine tasting reservation event with booking details
   */
  private async addToOrangeCalendar(booking: UserBooking, bookingDto: CreateBookingDto, orangeCreds: any): Promise<void> {
    try {
      console.log('🍊 Starting Orange calendar integration for booking:', booking._id);

      // Validate credentials
      if (!orangeCreds.isActive || !orangeCreds.isValid) {
        console.log('ℹ️ Orange connector is inactive or invalid for user:', booking.userId);
        return;
      }

      console.log('📧 Using Orange credentials for user:', orangeCreds.username);

      // Decrypt the password for CalDAV authentication
      const decryptedPassword = EncryptionService.decrypt(orangeCreds.password);

      // Get or discover calendar with caching and retry logic
      const calendar = await this.getOrangeCalendar(orangeCreds.username, decryptedPassword);
      console.log('📅 Calendar URL:', calendar.url);

      // Construct event start date from booking data
      const startDate = bookingDto.bookingDate instanceof Date
        ? new Date(`${bookingDto.bookingDate.toISOString().split('T')[0]}T${bookingDto.bookingTime}:00`)
        : new Date(`${bookingDto.bookingDate}T${bookingDto.bookingTime}:00`);
      
      if (isNaN(startDate.getTime())) {
        throw new Error(`Invalid date constructed from booking data`);
      }
      
      // Determine event duration from service details
      const eventDuration = await this.getServiceDuration(booking.userId, bookingDto.serviceId);

      const endDate = new Date(startDate.getTime() + (eventDuration * 60 * 1000));

      // Create iCal event for the booking
      const eventTitle = `Réservation: ${bookingDto.userContactFirstname} ${bookingDto.userContactLastname}`;
      const eventUid = uuidv4();
      
      const icalCalendar = ical({ name: 'ROSEDESVINS APP' });
      const event = icalCalendar.createEvent({
        start: startDate,
        end: endDate,
        summary: eventTitle,
        organizer: {
          name: 'ROSEDESVINS APP',
          email: orangeCreds.username
        },
        created: new Date(),
        lastModified: new Date()
      });
      
      event.uid(eventUid);

      const eventIcal = icalCalendar.toString();
      const filename = `${eventUid}.ics`;

      // Upload event to Orange calendar via CalDAV
      const eventUrl = calendar.url + encodeURIComponent(filename);
      const authHeader = `Basic ${Buffer.from(`${orangeCreds.username}:${decryptedPassword}`).toString('base64')}`;
      
      const response = await fetch(eventUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Authorization': authHeader,
          'If-None-Match': '*'
        },
        body: eventIcal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log('✅ Successfully added booking to Orange calendar!');
      console.log('📅 Event details:', {
        title: eventTitle,
        start: startDate.toLocaleString(),
        end: endDate.toLocaleString(),
        uid: eventUid,
        bookingId: booking._id
      });

    } catch (error) {
      console.error('❌ Orange calendar integration error:', error);
      // Don't throw - this is a background process
    }
  }

  /**
   * Helper method to get service duration from domain profile
   */
  private async getServiceDuration(userId: Types.ObjectId, serviceId: string): Promise<number> {
    try {
      const domainProfile = await this.domainProfileModel
        .findOne({ userId })
        .select('services')
        .lean()
        .exec();

      if (domainProfile?.services) {
        const service = domainProfile.services.find(s => (s as any)._id?.toString() === serviceId);
        return service?.timeOfServiceInMinutes || 60;
      }
    } catch (error) {
      console.warn('Could not fetch service duration, using default:', error);
    }
    return 60; // Default 1 hour
  }

  /**
   * Get or discover Orange calendar with caching and retry logic
   */
  private async getOrangeCalendar(username: string, password: string, retryCount = 0): Promise<any> {
    const cacheKey = `orange-${username}`;
    const cached = this.calendarCache.get(cacheKey);
    
    // Check if we have a valid cached calendar
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      console.log('📅 Using cached calendar');
      return cached.calendar;
    }

    try {
      console.log('🔍 Discovering calendars...');
      
      // Create CalDAV client
      const xhr = new dav.transport.Basic(
        new dav.Credentials({
          username,
          password
        })
      );

      const account = await dav.createAccount({
        server: 'https://caldav.orange.fr',
        xhr: xhr,
        accountType: 'caldav'
      });

      if (!account.calendars || account.calendars.length === 0) {
        throw new Error('No calendars found for Orange account');
      }

      const calendar = account.calendars[0];
      
      // Cache the discovered calendar
      this.calendarCache.set(cacheKey, {
        calendar,
        timestamp: Date.now()
      });

      console.log('📅 Calendar discovered and cached:', calendar.displayName || 'Default Calendar');
      return calendar;

    } catch (error) {
      console.error('Error discovering calendar:', error);
      
      // Retry logic for network issues
      if (retryCount < 2 && (error.message.includes('Bad status') || error.message.includes('network'))) {
        console.log(`🔄 Retrying calendar discovery (attempt ${retryCount + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return this.getOrangeCalendar(username, password, retryCount + 1);
      }
      
      throw error;
    }
  }
}
