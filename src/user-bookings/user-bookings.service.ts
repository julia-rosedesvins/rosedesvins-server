import { Injectable, BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
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
import { CreateBookingDto, UpdateBookingDto } from '../validators/user-bookings.validators';
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
        customerEmail: createBookingDto.customerEmail,
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
          eventName: `Réservation: ${createBookingDto.userContactFirstname} ${createBookingDto.userContactLastname}`,
          eventDate: parsedDate, // Use the same parsed date
          eventTime: createBookingDto.bookingTime,
          eventDescription: createBookingDto.additionalNotes || `Wine tasting booking for ${createBookingDto.participantsAdults + createBookingDto.participantsEnfants} people`,
          customerEmail: createBookingDto.customerEmail, // Store customer email for easy access
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

  /**
   * Update a booking in user-bookings, events, and linked calendars
   * @param bookingId - The ID of the booking to update
   * @param updateData - The fields to update
   */
  async updateBooking(bookingId: string, updateData: UpdateBookingDto): Promise<{ success: boolean; message: string; booking: UserBooking }> {
    try {
      console.log('📝 Starting booking update process for ID:', bookingId);

      // Validate booking ID format
      if (!Types.ObjectId.isValid(bookingId)) {
        throw new BadRequestException('Invalid booking ID format');
      }

      const bookingObjectId = new Types.ObjectId(bookingId);

      // Find the existing booking
      const existingBooking = await this.userBookingModel.findById(bookingObjectId).lean();
      if (!existingBooking) {
        throw new NotFoundException('Booking not found');
      }

      console.log('📋 Found booking to update:', {
        id: existingBooking._id,
        userId: existingBooking.userId,
        currentDate: existingBooking.bookingDate,
        currentTime: existingBooking.bookingTime
      });

      // Prepare update data (only include provided fields)
      const updateFields: any = {};
      
      if (updateData.bookingDate) {
        updateFields.bookingDate = updateData.bookingDate;
      }
      if (updateData.bookingTime) {
        updateFields.bookingTime = updateData.bookingTime;
      }
      if (updateData.participantsAdults !== undefined) {
        updateFields.participantsAdults = updateData.participantsAdults;
      }
      if (updateData.participantsEnfants !== undefined) {
        updateFields.participantsEnfants = updateData.participantsEnfants;
      }
      if (updateData.selectedLanguage) {
        updateFields.selectedLanguage = updateData.selectedLanguage;
      }
      if (updateData.userContactFirstname) {
        updateFields.userContactFirstname = updateData.userContactFirstname;
      }
      if (updateData.userContactLastname) {
        updateFields.userContactLastname = updateData.userContactLastname;
      }
      if (updateData.phoneNo) {
        updateFields.phoneNo = updateData.phoneNo;
      }
      if (updateData.customerEmail) {
        updateFields.customerEmail = updateData.customerEmail;
      }
      if (updateData.additionalNotes) {
        updateFields.additionalNotes = updateData.additionalNotes;
      }

      // Check if date or time changed (calendar update needed)
      const isDateTimeChanged = updateData.bookingDate || updateData.bookingTime;
      const isCustomerInfoChanged = updateData.userContactFirstname || updateData.userContactLastname;
      
      // Update the booking in database
      const updatedBooking = await this.userBookingModel.findByIdAndUpdate(
        bookingObjectId,
        updateFields,
        { new: true, runValidators: true }
      );

      if (!updatedBooking) {
        throw new InternalServerErrorException('Failed to update booking');
      }

      // Update corresponding event in events table
      const eventUpdateFields: any = {};
      
      if (updateData.bookingDate) {
        eventUpdateFields.eventDate = updateData.bookingDate;
      }
      if (updateData.bookingTime) {
        eventUpdateFields.eventTime = updateData.bookingTime;
      }
      if (isCustomerInfoChanged) {
        eventUpdateFields.eventName = `Réservation: ${updateData.userContactFirstname || existingBooking.userContactFirstname} ${updateData.userContactLastname || existingBooking.userContactLastname}`;
      }
      if (updateData.additionalNotes) {
        eventUpdateFields.eventDescription = updateData.additionalNotes;
      }
      if (updateData.customerEmail) {
        eventUpdateFields.customerEmail = updateData.customerEmail;
      }

      // Update events table
      if (Object.keys(eventUpdateFields).length > 0) {
        const eventUpdateResult = await this.eventModel.updateMany(
          {
            $or: [
              { bookingId: bookingObjectId },
              { 
                userId: existingBooking.userId,
                eventDate: existingBooking.bookingDate,
                eventTime: existingBooking.bookingTime
              }
            ]
          },
          eventUpdateFields
        );

        console.log('📅 Updated events:', eventUpdateResult.modifiedCount);
      }

      // Update calendar if date/time/customer info changed
      let calendarUpdateSuccess = true;
      if (isDateTimeChanged || isCustomerInfoChanged) {
        try {
          await this.updateInCalendar(existingBooking, updatedBooking);
          console.log('✅ Successfully updated booking in calendar');
        } catch (calendarError) {
          console.error('❌ Failed to update booking in calendar:', calendarError.message);
          calendarUpdateSuccess = false;
          // Don't throw - calendar update failure shouldn't prevent database update
        }
      }

      console.log('✅ Successfully updated booking:', bookingId);

      return {
        success: true,
        message: calendarUpdateSuccess 
          ? 'Booking updated successfully in database and calendar'
          : 'Booking updated successfully in database (calendar update failed)',
        booking: updatedBooking
      };

    } catch (error) {
      console.error('❌ Error updating booking:', error);
      
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to update booking');
    }
  }

  /**
   * Update booking event in linked calendars
   * @param oldBooking - The original booking data
   * @param newBooking - The updated booking data
   */
  private async updateInCalendar(oldBooking: any, newBooking: any): Promise<void> {
    try {
      console.log('📅 Updating calendar for booking:', newBooking._id);

      // Find active calendar connectors for the user
      const connectors = await this.connectorModel.find({
        userId: newBooking.userId
      }).lean();

      if (connectors.length === 0) {
        console.log('ℹ️ No active calendar connectors found for user:', newBooking.userId);
        return;
      }

      // Check for active Orange connector
      const orangeConnector = connectors.find(conn => 
        conn.connector_name === 'orange' && 
        conn.connector_creds?.orange?.isActive && 
        conn.connector_creds?.orange?.isValid
      );

      if (orangeConnector?.connector_creds?.orange) {
        console.log('🍊 Found Orange calendar connector for update');
        await this.updateInOrangeCalendar(oldBooking, newBooking, orangeConnector.connector_creds.orange);
      } else {
        console.log('ℹ️ No active Orange calendar connector found for update');
      }

      // TODO: Add support for Microsoft and OVH calendar providers

    } catch (error) {
      console.error('❌ Calendar update error:', error);
      // Non-blocking: Calendar update failure shouldn't prevent booking update
    }
  }

  /**
   * Update booking event in Orange Mail calendar using CalDAV
   * This deletes the old event and creates a new one with updated information
   * @param oldBooking - The original booking data
   * @param newBooking - The updated booking data
   * @param orangeCreds - The Orange calendar credentials
   */
  private async updateInOrangeCalendar(oldBooking: any, newBooking: any, orangeCreds: any): Promise<void> {
    try {
      console.log('🍊 Updating Orange calendar for booking:', newBooking._id);

      // Validate credentials
      if (!orangeCreds.isActive || !orangeCreds.isValid) {
        console.log('ℹ️ Orange connector is inactive or invalid for user:', newBooking.userId);
        return;
      }

      if (!orangeCreds.username || !orangeCreds.password) {
        console.log('❌ Missing Orange credentials for user:', newBooking.userId);
        return;
      }

      // Strategy: Delete old event and create new one
      // This is more reliable than trying to update in place

      // Step 1: Delete the old event
      console.log('🗑️ Deleting old calendar event...');
      await this.deleteFromOrangeCalendar(oldBooking, orangeCreds);

      // Step 2: Create new event with updated data
      console.log('➕ Creating updated calendar event...');
      
      // Create a temporary booking DTO for the new event
      const updatedBookingDto = {
        userId: newBooking.userId.toString(),
        serviceId: newBooking.serviceId.toString(),
        bookingDate: newBooking.bookingDate,
        bookingTime: newBooking.bookingTime,
        participantsAdults: newBooking.participantsAdults,
        participantsEnfants: newBooking.participantsEnfants,
        selectedLanguage: newBooking.selectedLanguage,
        userContactFirstname: newBooking.userContactFirstname,
        userContactLastname: newBooking.userContactLastname,
        phoneNo: newBooking.phoneNo,
        customerEmail: newBooking.customerEmail,
        additionalNotes: newBooking.additionalNotes,
        paymentMethod: newBooking.paymentMethod
      };

      await this.addToOrangeCalendar(newBooking, updatedBookingDto, orangeCreds);

      console.log('✅ Successfully updated event in Orange calendar');

    } catch (error) {
      console.error('❌ Orange calendar update error:', error);
      if (error.cause?.code === 'ENOTFOUND') {
        throw new Error('Calendar server is unreachable. Please check network connectivity.');
      }
      throw error;
    }
  }

  /**
   * Delete a booking from user-bookings, events, and linked calendars
   * @param bookingId - The ID of the booking to delete
   */
  async deleteBooking(bookingId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🗑️ Starting booking deletion process for ID:', bookingId);

      // Validate booking ID format
      if (!Types.ObjectId.isValid(bookingId)) {
        throw new BadRequestException('Invalid booking ID format');
      }

      const bookingObjectId = new Types.ObjectId(bookingId);

      // Find the booking to get details before deletion
      const booking = await this.userBookingModel.findById(bookingObjectId).lean();
      if (!booking) {
        throw new NotFoundException('Booking not found');
      }

      console.log('📋 Found booking to delete:', {
        id: booking._id,
        userId: booking.userId,
        serviceId: booking.serviceId,
        date: booking.bookingDate,
        time: booking.bookingTime
      });

      // Delete from calendar if linked
      await this.deleteFromCalendar(booking);

      // Delete from events table
      const eventDeleteResult = await this.eventModel.deleteMany({
        $or: [
          { bookingId: bookingObjectId },
          { 
            userId: booking.userId,
            eventDate: booking.bookingDate,
            eventTime: booking.bookingTime
          }
        ]
      });

      console.log('📅 Deleted events:', eventDeleteResult.deletedCount);

      // Delete from user-bookings table
      const bookingDeleteResult = await this.userBookingModel.findByIdAndDelete(bookingObjectId);

      if (!bookingDeleteResult) {
        throw new InternalServerErrorException('Failed to delete booking from database');
      }

      console.log('✅ Successfully deleted booking:', bookingId);

      return {
        success: true,
        message: 'Booking deleted successfully from database and calendar'
      };

    } catch (error) {
      console.error('❌ Error deleting booking:', error);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to delete booking');
    }
  }

  /**
   * Delete booking event from linked calendars
   * @param booking - The booking to delete from calendar
   */
  private async deleteFromCalendar(booking: any): Promise<void> {
    try {
      console.log('📅 Attempting to delete from calendar for booking:', booking._id);

      // Find active calendar connectors for the user
      const connectors = await this.connectorModel.find({
        userId: booking.userId
      }).lean();

      if (connectors.length === 0) {
        console.log('ℹ️ No active calendar connectors found for user:', booking.userId);
        return;
      }

      // Check for active Orange connector (matching the existing structure)
      const orangeConnector = connectors.find(conn => 
        conn.connector_name === 'orange' && 
        conn.connector_creds?.orange?.isActive && 
        conn.connector_creds?.orange?.isValid
      );

      if (orangeConnector?.connector_creds?.orange) {
        console.log('🍊 Found Orange calendar connector for deletion');
        await this.deleteFromOrangeCalendar(booking, orangeConnector.connector_creds.orange);
      } else {
        console.log('ℹ️ No active Orange calendar connector found for deletion');
      }

      // TODO: Add support for Microsoft and OVH calendar providers

    } catch (error) {
      console.error('❌ Calendar deletion error:', error);
      // Non-blocking: Calendar deletion failure shouldn't prevent booking deletion
    }
  }

  /**
   * Delete booking event from Orange Mail calendar using CalDAV
   * @param booking - The booking to delete
   * @param orangeCreds - The Orange calendar credentials
   */
  private async deleteFromOrangeCalendar(booking: any, orangeCreds: any): Promise<void> {
    try {
      console.log('🍊 Deleting from Orange calendar for booking:', booking._id);

      // Validate credentials
      if (!orangeCreds.isActive || !orangeCreds.isValid) {
        console.log('ℹ️ Orange connector is inactive or invalid for user:', booking.userId);
        return;
      }

      if (!orangeCreds.username || !orangeCreds.password) {
        console.log('❌ Missing Orange credentials for user:', booking.userId);
        return;
      }

      // Decrypt the password for CalDAV authentication
      const decryptedPassword = EncryptionService.decrypt(orangeCreds.password);

      // Get calendar
      const calendar = await this.getOrangeCalendar(orangeCreds.username, decryptedPassword);
      if (!calendar) {
        console.log('❌ Could not access Orange calendar for user:', booking.userId);
        return;
      }

      // Try to delete using PROPFIND + DELETE approach (more compatible with CalDAV)
      try {
        const authHeader = `Basic ${Buffer.from(`${orangeCreds.username}:${decryptedPassword}`).toString('base64')}`;
        
        // First, try to find events using PROPFIND
        const propfindBody = `<?xml version="1.0" encoding="UTF-8"?>
          <D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
            <D:prop>
              <D:getetag/>
              <C:calendar-data/>
            </D:prop>
          </D:propfind>`;

        const propfindResponse = await fetch(calendar.url, {
          method: 'PROPFIND',
          headers: {
            'Content-Type': 'application/xml',
            'Authorization': authHeader,
            'Depth': '1'
          },
          body: propfindBody
        });

        if (propfindResponse.ok) {
          const responseText = await propfindResponse.text();
          // Use the same title format as when creating the event (Réservation: not Booking:)
          const expectedEventTitle = `Réservation: ${booking.userContactFirstname} ${booking.userContactLastname}`;
          
          console.log('📋 Looking for event with title:', expectedEventTitle);
          console.log('📄 PROPFIND response length:', responseText.length);
          
          // Search for our event in the response (case-insensitive and flexible)
          const customerName = `${booking.userContactFirstname} ${booking.userContactLastname}`;
          const eventFound = responseText.toLowerCase().includes(expectedEventTitle.toLowerCase()) || 
                            responseText.toLowerCase().includes(customerName.toLowerCase());
          
          console.log('🔍 Event search results:', { 
            expectedTitle: expectedEventTitle, 
            customerName: customerName, 
            found: eventFound 
          });
          
          if (eventFound) {
            console.log('🎯 Found matching event in calendar');
            
            // Extract all href URLs - try multiple patterns as XML namespace can vary
            let hrefMatches = responseText.match(/<D:href>([^<]+)<\/D:href>/g);
            if (!hrefMatches) {
              // Try without namespace prefix
              hrefMatches = responseText.match(/<href>([^<]+)<\/href>/gi);
            }
            if (!hrefMatches) {
              // Try with different namespace
              hrefMatches = responseText.match(/<[a-z]*:?href[^>]*>([^<]+)<\/[a-z]*:?href>/gi);
            }
            
            let eventDeleted = false;
            
            console.log('🔎 Total href matches found:', hrefMatches?.length || 0);
            
            // If no hrefs found, let's see what the XML structure actually looks like
            if (!hrefMatches || hrefMatches.length === 0) {
              console.log('🔍 No href matches found, checking XML structure...');
              console.log('📝 First 1000 chars of response:', responseText.substring(0, 1000));
              console.log('📝 Last 1000 chars of response:', responseText.substring(responseText.length - 1000));
            }
            
            if (hrefMatches) {
              for (const hrefMatch of hrefMatches) {
                // Extract URL content from various href tag formats
                let url = hrefMatch;
                
                // Remove all possible href tag variations
                url = url.replace(/<[^>]*href[^>]*>/gi, '').replace(/<\/[^>]*href[^>]*>/gi, '');
                url = url.replace(/<\/?[a-z]*:?href[^>]*>/gi, '');
                
                // Skip calendar collection URLs - we need specific event files
                if (url.endsWith('/') || (!url.includes('.ics') && !url.match(/[a-f0-9-]{36}\.ics$/i))) {
                  console.log('⏭️ Skipping calendar collection URL:', url);
                  continue;
                }
                
                console.log('🔍 Checking event file:', url);
                
                // Look for the calendar-data section that corresponds to this href
                const hrefIndex = responseText.indexOf(hrefMatch);
                const nextHrefIndex = responseText.indexOf('<d:href>', hrefIndex + 1);
                const eventDataSection = responseText.substring(hrefIndex, nextHrefIndex !== -1 ? nextHrefIndex : responseText.length);
                
                // Also check for calendar-data tags that might contain the event
                const calendarDataMatch = eventDataSection.match(/<[cd]:calendar-data[^>]*>(.*?)<\/[cd]:calendar-data>/gis);
                let eventContainsTitle = false;
                
                if (calendarDataMatch) {
                  // Check inside the calendar data for our event title
                  for (const calendarData of calendarDataMatch) {
                    if (calendarData.toLowerCase().includes(expectedEventTitle.toLowerCase()) || 
                        calendarData.toLowerCase().includes(`summary:${expectedEventTitle.toLowerCase()}`) ||
                        calendarData.toLowerCase().includes(customerName.toLowerCase())) {
                      eventContainsTitle = true;
                      console.log('🎯 Found matching event content in calendar data');
                      break;
                    }
                  }
                } else {
                  // Fallback: check the entire event section
                  eventContainsTitle = eventDataSection.toLowerCase().includes(expectedEventTitle.toLowerCase()) ||
                                      eventDataSection.toLowerCase().includes(customerName.toLowerCase());
                }
                
                console.log('🔍 Event match check:', { url, eventContainsTitle, hasCalendarData: !!calendarDataMatch });
                
                if (eventContainsTitle) {
                  console.log('🎯 Found matching event in:', url);
                  
                  // Get the full event URL
                  let eventUrl = url;
                  if (url.startsWith('/')) {
                    const baseUrl = new URL(calendar.url);
                    eventUrl = `${baseUrl.protocol}//${baseUrl.host}${url}`;
                  } else if (!url.startsWith('http')) {
                    eventUrl = calendar.url.replace(/\/$/, '') + '/' + url.split('/').pop();
                  }
                  
                  console.log('🗑️ Deleting event at:', eventUrl);
                  
                  // Try to delete the event
                  const deleteResponse = await fetch(eventUrl, {
                    method: 'DELETE',
                    headers: {
                      'Authorization': authHeader
                    }
                  });

                  console.log('🗑️ Delete response status:', deleteResponse.status);
                  
                  if (deleteResponse.ok || deleteResponse.status === 404) {
                    console.log('✅ Successfully deleted event from Orange calendar');
                    eventDeleted = true;
                    break; // Exit loop once we successfully delete the correct event
                  } else {
                    const errorText = await deleteResponse.text();
                    console.log('⚠️ Could not delete event:', deleteResponse.status, errorText);
                  }
                } else {
                  console.log('⏭️ Event does not match, skipping:', url);
                }
              }
            }
            
            if (!eventDeleted) {
              console.log('❌ Could not delete any matching events from calendar');
            }
          } else {
            console.log('ℹ️ Event not found in Orange calendar (may have been already deleted)');
          }
        } else {
          console.log('⚠️ Could not search calendar events:', propfindResponse.status);
          const errorText = await propfindResponse.text();
          console.log('❌ PROPFIND error response:', errorText.substring(0, 500));
        }
        
      } catch (searchError) {
        console.log('ℹ️ Calendar event search failed, event may remain in calendar:', searchError.message);
      }

    } catch (error) {
      console.error('❌ Orange calendar deletion error:', error);
      throw error;
    }
  }
}
