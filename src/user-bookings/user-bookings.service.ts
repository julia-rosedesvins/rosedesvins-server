import { Injectable, BadRequestException, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
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
import { EmailService } from '../email/email.service';
import { TemplateService } from '../email/template.service';
import { ConnectorService } from '../connector/connector.service';

const dav = require('dav');

export interface BookingEmailData {
  customerName: string;
  customerEmail: string;
  providerName: string;
  providerEmail: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventTimezone: string;
  eventDuration: string;
  eventLocation?: string;
  eventDescription?: string;
  participantsAdults: number;
  participantsChildren: number;
  selectedLanguage: string;
  additionalNotes?: string;
  // Enhanced template fields
  domainName: string;
  domainAddress: string;
  domainLogoUrl: string;
  serviceName: string;
  serviceDescription: string;
  totalPrice: string;
  paymentMethod: string;
  frontendUrl: string;
  appLogoUrl: string;
  backendUrl: string;
  serviceBannerUrl: string;
}

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
    private encryptionService: EncryptionService,
    private emailService: EmailService,
    private templateService: TemplateService,
    private connectorService: ConnectorService,
    private configService: ConfigService,
  ) { }

  /**
   * Helper method to safely join URL parts without double slashes
   */
  private joinUrl(baseUrl: string, path: string): string {
    if (!baseUrl || !path) return baseUrl || path || '';

    // Remove trailing slash from base URL and leading slash from path
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const cleanPath = path.replace(/^\/+/, '');

    return `${cleanBase}/${cleanPath}`;
  }

  /**
   * Helper method to construct full image URLs for email templates
   */
  private constructImageUrls(domainProfile: any, service: any) {
    const backendUrl = this.configService.get('BACKEND_URL') || 'http://localhost:3000';
    
    return {
      domainLogoUrl: this.joinUrl(backendUrl, domainProfile?.domainLogoUrl || '/assets/logo.png'),
      serviceBannerUrl: this.joinUrl(backendUrl, service?.serviceBannerUrl || '/uploads/default-service-banner.jpg'),
      appLogoUrl: this.joinUrl(backendUrl, this.configService.get('APP_LOGO') || '/assets/logo.png'),
    };
  }

  /**
   * Send booking confirmation email to customer using booking-specific templates
   */
  private async sendCustomerBookingEmail(bookingData: BookingEmailData, type: 'created' | 'updated' | 'cancelled'): Promise<void> {
    setImmediate(async () => {
      try {
        const subject = this.getEmailSubject(type, 'customer');

        const templateData = {
          customerName: bookingData.customerName,
          eventTitle: bookingData.eventTitle,
          eventDate: bookingData.eventDate,
          eventTime: bookingData.eventTime,
          eventTimezone: bookingData.eventTimezone,
          eventDuration: bookingData.eventDuration,
          participantsAdults: bookingData.participantsAdults,
          participantsChildren: bookingData.participantsChildren,
          selectedLanguage: bookingData.selectedLanguage,
          additionalNotes: bookingData.additionalNotes,
          domainName: bookingData.domainName,
          domainAddress: bookingData.domainAddress,
          domainLogoUrl: bookingData.domainLogoUrl,
          serviceName: bookingData.serviceName,
          serviceDescription: bookingData.serviceDescription,
          totalPrice: bookingData.totalPrice,
          paymentMethod: bookingData.paymentMethod || 'Paiement sur place (cartes, chèques, liquide)',
          frontendUrl: bookingData.frontendUrl,
          backendUrl: bookingData.backendUrl,
          appLogoUrl: bookingData.appLogoUrl,
          serviceBannerUrl: bookingData.serviceBannerUrl,
        };

        let emailHtml: string;

        // Use specific templates based on type
        switch (type) {
          case 'created':
            emailHtml = this.templateService.generateBookingConfirmationEmail(templateData);
            break;
          case 'updated':
            emailHtml = this.templateService.generateBookingUpdateEmail(templateData);
            break;
          case 'cancelled':
            emailHtml = this.templateService.generateBookingCancellationEmail(templateData);
            break;
        }

        const emailJob = {
          to: bookingData.customerEmail,
          subject,
          html: emailHtml,
        };

        await this.emailService.sendEmail(emailJob);
        console.log(`${type} email sent to customer: ${bookingData.customerEmail}`);
      } catch (error) {
        console.error(`Failed to send ${type} email to customer:`, error);
      }
    });
  }

  /**
   * Send booking notification email to service provider using existing templates
   */
  private async sendProviderBookingEmail(bookingData: BookingEmailData, type: 'created'): Promise<void> {
    setImmediate(async () => {
      try {
        const subject = this.getEmailSubject(type, 'provider');

        // Use the existing provider notification template
        const emailHtml = this.templateService.generateProviderNotificationEmail({
          providerName: bookingData.providerName,
          providerEmail: bookingData.providerEmail,
          customerName: bookingData.customerName,
          eventTitle: bookingData.eventTitle,
          eventDate: bookingData.eventDate,
          eventTime: bookingData.eventTime,
          eventTimezone: bookingData.eventTimezone,
          eventDuration: bookingData.eventDuration,
          eventDescription: this.formatEventDescription(bookingData, type),
          hoursBeforeEvent: 0, // Immediate notification
        });

        const emailJob = {
          to: bookingData.providerEmail,
          subject,
          html: emailHtml,
        };

        await this.emailService.sendEmail(emailJob);
        console.log(`${type} email sent to provider: ${bookingData.providerEmail}`);
      } catch (error) {
        console.error(`Failed to send ${type} email to provider:`, error);
      }
    });
  }

  /**
   * Generate email subject based on type and recipient
   */
  private getEmailSubject(type: 'created' | 'updated' | 'cancelled', recipient: 'customer' | 'provider'): string {
    const subjects = {
      created: {
        customer: 'Confirmation de votre réservation - Rose des Vins 🍷',
        provider: 'Nouvelle réservation reçue - Rose des Vins'
      },
      updated: {
        customer: 'Modification de votre réservation - Rose des Vins 🍷',
        provider: 'Réservation modifiée - Rose des Vins'
      },
      cancelled: {
        customer: 'Annulation de votre réservation - Rose des Vins',
        provider: 'Réservation annulée - Rose des Vins'
      }
    };

    return subjects[type][recipient];
  }

  /**
   * Format event description based on booking data and type
   */
  private formatEventDescription(bookingData: BookingEmailData, type: 'created' | 'updated' | 'cancelled'): string {
    const totalParticipants = bookingData.participantsAdults + bookingData.participantsChildren;
    const participantsText = bookingData.participantsChildren > 0
      ? `${totalParticipants} personnes (${bookingData.participantsAdults} adultes, ${bookingData.participantsChildren} enfants)`
      : `${bookingData.participantsAdults} adulte${bookingData.participantsAdults > 1 ? 's' : ''}`;

    let description = `Participants: ${participantsText}\nLangue: ${bookingData.selectedLanguage}`;

    if (bookingData.additionalNotes) {
      description += `\nNotes: ${bookingData.additionalNotes}`;
    }

    const statusText = {
      created: 'Votre réservation a été confirmée avec succès.',
      updated: 'Votre réservation a été modifiée.',
      cancelled: 'Votre réservation a été annulée.'
    };

    description = `${statusText[type]}\n\n${description}`;

    return description;
  }

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

      // Send email notifications (non-blocking)
      setImmediate(async () => {
        try {
          // Get user and domain profile for email data
          const user = await this.userModel.findById(createBookingDto.userId);

          // Check if domain profile exists - convert userId to ObjectId for proper comparison
          const userObjectIdForQuery = new Types.ObjectId(createBookingDto.userId);
          const domainProfile = await this.domainProfileModel.findOne({ userId: userObjectIdForQuery });


          // Find the service info from domain profile using _id
          let service: any = null;
          if (domainProfile?.services && domainProfile.services.length > 0) {
            service = domainProfile.services.find(s => {
              return (s as any)._id?.toString() === createBookingDto.serviceId;
            });
          } else {
            console.log('Debug - No services found in domain profile, using fallback');
          }

          // Create a fallback service name based on user's business or default
          let eventTitle = 'Dégustation de vins'; // Default fallback
          if (service?.name) {
            eventTitle = service.name;
          } else if (domainProfile?.domainDescription) {
            eventTitle = `Dégustation - ${domainProfile.domainDescription}`;
          } else if (user?.firstName && user?.lastName) {
            eventTitle = `Dégustation - ${user.firstName} ${user.lastName}`;
          }

          console.log('Debug - Final eventTitle:', eventTitle);

          const bookingEmailData: BookingEmailData = {
            customerName: `${createBookingDto.userContactFirstname} ${createBookingDto.userContactLastname}`,
            customerEmail: createBookingDto.customerEmail,
            providerName: user ? `${user.firstName} ${user.lastName}` : 'Rose des Vins',
            providerEmail: user ? user.email : 'admin@rosedesvins.com',
            eventTitle: eventTitle,
            eventDate: new Date(createBookingDto.bookingDate).toLocaleDateString('fr-FR'),
            eventTime: createBookingDto.bookingTime,
            eventTimezone: 'CET',
            eventDuration: service?.timeOfServiceInMinutes ? `${service.timeOfServiceInMinutes} minutes` : '60 minutes',
            participantsAdults: createBookingDto.participantsAdults,
            participantsChildren: createBookingDto.participantsEnfants || 0,
            selectedLanguage: createBookingDto.selectedLanguage,
            additionalNotes: createBookingDto.additionalNotes,
            // Enhanced template data
            domainName: user?.domainName || 'Domaine La Bastide Blanche',
            domainAddress: user?.address && user?.codePostal && user?.city
              ? `${user.address} - ${user.codePostal} - ${user.city}`
              : '367, Route des Oratoires - 83330 - Sainte-Anne du Castellet',
            domainLogoUrl: domainProfile?.domainLogoUrl || 'https://rosedesvins.co/assets/logo.png',
            serviceName: service?.name || 'Visite de cave et dégustation de vins',
            serviceDescription: service?.description || 'Une expérience unique avec la visite libre de notre cave troglodytique sculptée, suivie d\'une dégustation commentée de 5 vins dans notre caveau à l\'ambiance feutrée, éclairé à la bougie.',
            totalPrice: service?.pricePerPerson ? `${service.pricePerPerson} €` : '20 €',
            paymentMethod: 'Paiement sur place (cartes, chèques, liquide)',
            frontendUrl: this.configService.get('FRONTEND_URL') || 'https://rosedesvins.co',
            appLogoUrl: this.configService.get('APP_LOGO') || 'https://rosedesvins.co/assets/logo.png',
            backendUrl: this.configService.get('BACKEND_URL') || 'http://localhost:3000',
            serviceBannerUrl: service?.serviceBannerUrl || '/uploads/default-service-banner.jpg',
          };

          // Fix URLs to avoid double slashes
          bookingEmailData.domainLogoUrl = this.joinUrl(this.configService.get('BACKEND_URL') || 'http://localhost:3000', domainProfile?.domainLogoUrl || '/assets/logo.png');
          bookingEmailData.serviceBannerUrl = this.joinUrl(this.configService.get('BACKEND_URL') || 'http://localhost:3000', service?.serviceBannerUrl || '/uploads/default-service-banner.jpg');

          // Send to customer (booking user)
          await this.sendCustomerBookingEmail(bookingEmailData, 'created');

          // Send to service provider (user)
          await this.sendProviderBookingEmail(bookingEmailData, 'created');
        } catch (emailError) {
          console.error('Failed to send booking emails:', emailError);
          // Don't fail the booking creation if email fails
        }
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

      // Check for active connectors based on connector_name
      const activeConnector = connectors.find(conn =>
        conn.connector_name !== 'none'
      );

      if (!activeConnector) {
        console.log('ℹ️ No active calendar connectors found for user:', booking.userId);
        return;
      }

      // Route to appropriate calendar based on connector_name
      switch (activeConnector.connector_name) {
        case 'orange':
          if (activeConnector.connector_creds?.orange?.isActive && activeConnector.connector_creds?.orange?.isValid) {
            console.log('🍊 Using Orange calendar for user:', booking.userId);
            await this.addToOrangeCalendar(booking, bookingDto, activeConnector.connector_creds.orange);
          }
          break;

        case 'microsoft':
          if (activeConnector.connector_creds?.microsoft?.isActive && activeConnector.connector_creds?.microsoft?.isValid) {
            console.log('🟦 Using Microsoft calendar for user:', booking.userId);
            await this.addToMicrosoftCalendar(booking, bookingDto, activeConnector.connector_creds.microsoft);
          }
          break;

        case 'ovh':
          console.log('ℹ️ OVH calendar integration not yet implemented');
          break;

        default:
          console.log('ℹ️ No supported calendar provider found for user:', booking.userId);
      }

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
      // const startDate = bookingDto.bookingDate instanceof Date
      //   ? new Date(`${bookingDto.bookingDate.toISOString().split('T')[0]}T${bookingDto.bookingTime}:00`)
      //   : new Date(`${bookingDto.bookingDate}T${bookingDto.bookingTime}:00`);

      const originalStartDate = bookingDto.bookingDate instanceof Date
        ? new Date(`${bookingDto.bookingDate.toISOString().split('T')[0]}T${bookingDto.bookingTime}:00`)
        : new Date(`${bookingDto.bookingDate}T${bookingDto.bookingTime}:00`);

      // ✅ QUICK FIX: Subtract 1 hour to compensate for Orange calendar timezone issue
      const startDate = new Date(originalStartDate.getTime() - (1 * 60 * 60 * 1000)); // Subtract 1 hour

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
   * Add booking event to Microsoft Calendar using Graph API
   * Creates a wine tasting reservation event with booking details
   */
  private async addToMicrosoftCalendar(booking: UserBooking, bookingDto: CreateBookingDto, microsoftCreds: any): Promise<void> {
    try {
      console.log('🟦 Starting Microsoft calendar integration for booking:', booking._id);

      // Validate credentials
      if (!microsoftCreds.isActive || !microsoftCreds.isValid) {
        console.log('ℹ️ Microsoft connector is inactive or invalid for user:', booking.userId);
        return;
      }

      console.log('📧 Using Microsoft credentials for user:', microsoftCreds.mail || microsoftCreds.userPrincipalName);

      // Get a valid access token (automatically refreshes if needed)
      console.log('🔑 Attempting to get Microsoft access token for user:', booking.userId.toString());
      const accessToken = await this.connectorService.getMicrosoftAccessToken(booking.userId.toString());

      console.log('🔑 Access token result:', {
        hasToken: !!accessToken,
        tokenLength: accessToken?.length || 0,
        tokenStart: accessToken?.substring(0, 20) + '...' || 'null'
      });

      if (!accessToken) {
        throw new Error('Failed to get valid Microsoft access token');
      }

      // Test the token first by calling /me endpoint
      console.log('🧪 Testing access token with /me endpoint...');
      const testResponse = await this.callMicrosoftGraphWithRetry('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      console.log('🧪 Test response:', {
        status: testResponse.status,
        statusText: testResponse.statusText
      });

      if (!testResponse.ok) {
        const testError = await testResponse.text();
        console.error('❌ Token test failed:', testError);
        throw new Error(`Access token is invalid: ${testResponse.status} - ${testError}`);
      }

      const userProfile = await testResponse.json();
      console.log('✅ Token test successful. User:', {
        id: userProfile.id,
        displayName: userProfile.displayName,
        mail: userProfile.mail
      });

      // Test calendar permissions specifically
      console.log('🧪 Testing calendar permissions...');
      const calendarTestResponse = await this.callMicrosoftGraphWithRetry('https://graph.microsoft.com/v1.0/me/calendars', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('📅 Calendar test response:', {
        status: calendarTestResponse.status,
        statusText: calendarTestResponse.statusText,
        data: calendarTestResponse
      });

      if (calendarTestResponse.ok) {
        const calendarData = await calendarTestResponse.json();
        console.log('✅ Calendar permissions work. Calendars found:', calendarData.value?.length || 0);
      } else {
        const errorText = await calendarTestResponse.text();
        console.log('❌ Calendar permissions failed:', errorText);

        if (calendarTestResponse.status === 401) {
          console.log('🚫 MICROSOFT AZURE APP NOT APPROVED!');
          console.log('💡 Solutions:');
          console.log('   1. Get Azure app approved by Microsoft (recommended for production)');
          console.log('   2. Use personal Microsoft account for testing');
          console.log('   3. Request admin consent in Azure portal');
          console.log('   4. Verify app permissions in Azure Active Directory');
        } else {
          // If calendar permissions fail, we still want to see the exact error
          console.log('🔍 This suggests the token lacks Calendars.ReadWrite permissions');
          console.log('💡 Solution: User needs to disconnect and reconnect Microsoft Calendar with proper permissions');
        }
      }

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

      // Create Microsoft Graph API event
      const eventTitle = `Réservation: ${bookingDto.userContactFirstname} ${bookingDto.userContactLastname}`;

      const eventBody = {
        subject: eventTitle,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'Europe/Paris'
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'Europe/Paris'
        },
        body: {
          contentType: 'html',
          content: this.generateEventDescription(bookingDto)
        },
        attendees: [
          {
            emailAddress: {
              address: bookingDto.customerEmail,
              name: `${bookingDto.userContactFirstname} ${bookingDto.userContactLastname}`
            },
            type: 'required'
          }
        ],
        location: {
          displayName: 'Rose des Vins - Dégustation'
        },
        showAs: 'busy',
        isReminderOn: true,
        reminderMinutesBeforeStart: 30
      };

      // Create event via Microsoft Graph API with retry logic
      console.log('📤 Making Microsoft Graph API request to create event');
      console.log('📋 Event body:', JSON.stringify(eventBody, null, 2));

      const response = await this.callMicrosoftGraphWithRetry('https://graph.microsoft.com/v1.0/me/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(eventBody)
      });

      console.log('📥 Microsoft Graph API response:', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Microsoft Graph API error response:', errorData);

        // Special handling for 401 errors with unapproved apps
        if (response.status === 401) {
          console.error('🚫 MICROSOFT AZURE APP NOT APPROVED!');
          console.error('💡 Solutions:');
          console.error('   1. Get Azure app approved by Microsoft (recommended for production)');
          console.error('   2. Use personal Microsoft account for testing');
          console.error('   3. Request admin consent in Azure portal');
          console.error('   4. Verify app permissions in Azure Active Directory');
        }

        throw new Error(`Microsoft Graph API error: ${response.status} - ${errorData}`);
      }

      const createdEvent = await response.json();

      // Store the Microsoft event ID in the booking for future operations
      await this.userBookingModel.updateOne(
        { _id: booking._id },
        { $set: { microsoftEventId: createdEvent.id } }
      );

      console.log('✅ Microsoft calendar event created successfully:', createdEvent.id);

    } catch (error) {
      console.error('❌ Microsoft calendar integration failed:', error);

      // Provide specific error messages based on error type
      if (error.name === 'TimeoutError' || error.code === 'ETIMEDOUT') {
        console.error('⏰ Network timeout when calling Microsoft Graph API');
        console.error('💡 This might be a temporary network issue or Microsoft Graph API slowness');
      } else if (error.cause?.code === 'ETIMEDOUT') {
        console.error('⏰ Connection timeout to Microsoft Graph API');
        console.error('💡 Check your internet connection or try again later');
      }

      throw error; // Re-throw to be caught by the main addToCalendar method
    }
  }

  /**
   * Helper method to call Microsoft Graph API with retry logic
   */
  private async callMicrosoftGraphWithRetry(url: string, options: any, maxRetries: number = 3): Promise<Response> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Microsoft Graph API attempt ${attempt}/${maxRetries}`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response;

      } catch (error) {
        console.error(`❌ Attempt ${attempt} failed:`, error.message);

        if (attempt === maxRetries) {
          throw error; // Re-throw on final attempt
        }

        // Exponential backoff: wait 2^attempt seconds
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    throw new Error('All retry attempts failed');
  }

  /**
   * Generate HTML description for calendar event
   */
  private generateEventDescription(bookingDto: CreateBookingDto): string {
    return `
      <h3>Réservation de Dégustation de Vins</h3>
      <p><strong>Client:</strong> ${bookingDto.userContactFirstname} ${bookingDto.userContactLastname}</p>
      <p><strong>Email:</strong> ${bookingDto.customerEmail}</p>
      <p><strong>Téléphone:</strong> ${bookingDto.phoneNo}</p>
      <p><strong>Participants:</strong> ${bookingDto.participantsAdults} adulte(s)${bookingDto.participantsEnfants > 0 ? ` + ${bookingDto.participantsEnfants} enfant(s)` : ''}</p>
      <p><strong>Langue:</strong> ${bookingDto.selectedLanguage}</p>
      ${bookingDto.additionalNotes ? `<p><strong>Notes:</strong> ${bookingDto.additionalNotes}</p>` : ''}
    `;
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

      // Send email notification to customer only (for updates)
      setImmediate(async () => {
        try {
          const user = await this.userModel.findById(updatedBooking.userId);
          const domainProfile = await this.domainProfileModel.findOne({ userId: updatedBooking.userId });

          console.log('Debug UPDATE - serviceId:', updatedBooking.serviceId?.toString());
          console.log('Debug UPDATE - domainProfile services:', domainProfile?.services);

          // Find the service info from domain profile using _id
          const service = domainProfile?.services?.find(s => {
            console.log('Debug UPDATE - service s:', s);
            console.log('Debug UPDATE - service s._id:', (s as any)._id);
            console.log('Debug UPDATE - comparison:', (s as any)._id?.toString() === updatedBooking.serviceId?.toString());
            return (s as any)._id?.toString() === updatedBooking.serviceId?.toString();
          });

          console.log('Debug UPDATE - final service found:', service);

          const bookingEmailData: BookingEmailData = {
            customerName: `${updatedBooking.userContactFirstname} ${updatedBooking.userContactLastname}`,
            customerEmail: updatedBooking.customerEmail,
            providerName: user ? `${user.firstName} ${user.lastName}` : 'Rose des Vins',
            providerEmail: user ? user.email : 'admin@rosedesvins.com',
            eventTitle: service?.name || 'Dégustation de vins',
            eventDate: new Date(updatedBooking.bookingDate).toLocaleDateString('fr-FR'),
            eventTime: updatedBooking.bookingTime,
            eventTimezone: 'CET',
            eventDuration: service?.timeOfServiceInMinutes ? `${service.timeOfServiceInMinutes} minutes` : '60 minutes',
            participantsAdults: updatedBooking.participantsAdults,
            participantsChildren: updatedBooking.participantsEnfants || 0,
            selectedLanguage: updatedBooking.selectedLanguage,
            additionalNotes: updatedBooking.additionalNotes,
            // Enhanced template data
            domainName: user?.domainName || 'Domaine La Bastide Blanche',
            domainAddress: user?.address && user?.codePostal && user?.city
              ? `${user.address} - ${user.codePostal} - ${user.city}`
              : '367, Route des Oratoires - 83330 - Sainte-Anne du Castellet',
            domainLogoUrl: domainProfile?.domainLogoUrl || 'https://rosedesvins.co/assets/logo.png',
            serviceName: service?.name || 'Visite de cave et dégustation de vins',
            serviceDescription: service?.description || 'Une expérience unique avec la visite libre de notre cave troglodytique sculptée, suivie d\'une dégustation commentée de 5 vins dans notre caveau à l\'ambiance feutrée, éclairé à la bougie.',
            totalPrice: service?.pricePerPerson ? `${service.pricePerPerson} €` : '20 €',
            paymentMethod: 'Paiement sur place (cartes, chèques, liquide)',
            frontendUrl: this.configService.get('FRONTEND_URL') || 'https://rosedesvins.co',
            appLogoUrl: this.configService.get('APP_LOGO') || 'https://rosedesvins.co/assets/logo.png',
            backendUrl: this.configService.get('BACKEND_URL') || 'http://localhost:3000',
            serviceBannerUrl: service?.serviceBannerUrl || '/uploads/default-service-banner.jpg',
          };

          // Fix URLs to avoid double slashes
          bookingEmailData.domainLogoUrl = this.joinUrl(this.configService.get('BACKEND_URL') || 'http://localhost:3000', domainProfile?.domainLogoUrl || '/assets/logo.png');
          bookingEmailData.serviceBannerUrl = this.joinUrl(this.configService.get('BACKEND_URL') || 'http://localhost:3000', service?.serviceBannerUrl || '/uploads/default-service-banner.jpg');

          // Send update notification to customer only
          await this.sendCustomerBookingEmail(bookingEmailData, 'updated');
        } catch (emailError) {
          console.error('Failed to send update email:', emailError);
          // Don't fail the update if email fails
        }
      });

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

      // Find the active connector based on connector_name
      const activeConnector = connectors.find(conn =>
        conn.connector_name !== 'none'
      );

      if (!activeConnector) {
        console.log('ℹ️ No active calendar connector found for update');
        return;
      }

      // Route to appropriate calendar based on connector_name
      switch (activeConnector.connector_name) {
        case 'orange':
          if (activeConnector.connector_creds?.orange?.isActive && activeConnector.connector_creds?.orange?.isValid) {
            console.log('🍊 Updating Orange calendar event');
            await this.updateInOrangeCalendar(oldBooking, newBooking, activeConnector.connector_creds.orange);
          }
          break;

        case 'microsoft':
          if (activeConnector.connector_creds?.microsoft?.isActive && activeConnector.connector_creds?.microsoft?.isValid) {
            console.log('🟦 Updating Microsoft calendar event');
            await this.updateInMicrosoftCalendar(oldBooking, newBooking, activeConnector.connector_creds.microsoft);
          }
          break;

        case 'ovh':
          console.log('ℹ️ OVH calendar update not yet implemented');
          break;

        default:
          console.log('ℹ️ No supported calendar provider found for update');
      }

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
   * Update booking event in Microsoft Calendar using Graph API
   */
  private async updateInMicrosoftCalendar(oldBooking: any, newBooking: any, microsoftCreds: any): Promise<void> {
    try {
      console.log('🟦 Updating Microsoft calendar event for booking:', newBooking._id);

      // Check if we have a Microsoft event ID to update
      if (!newBooking.microsoftEventId) {
        console.log('ℹ️ No Microsoft event ID found, creating new event instead');
        // Convert newBooking to CreateBookingDto format for creating new event
        const bookingDto = {
          userId: newBooking.userId.toString(),
          serviceId: newBooking.serviceId.toString(),
          bookingDate: newBooking.bookingDate,
          bookingTime: newBooking.bookingTime,
          participantsAdults: newBooking.participantsAdults,
          participantsEnfants: newBooking.participantsEnfants,
          selectedLanguage: newBooking.selectedLanguage,
          userContactFirstname: newBooking.userContactFirstname,
          userContactLastname: newBooking.userContactLastname,
          customerEmail: newBooking.customerEmail,
          phoneNo: newBooking.phoneNo,
          additionalNotes: newBooking.additionalNotes,
          paymentMethod: newBooking.paymentMethod
        };
        await this.addToMicrosoftCalendar(newBooking, bookingDto, microsoftCreds);
        return;
      }

      // Get a valid access token
      const accessToken = await this.connectorService.getMicrosoftAccessToken(newBooking.userId.toString());

      if (!accessToken) {
        throw new Error('Failed to get valid Microsoft access token');
      }

      // Construct updated event data
      const startDate = newBooking.bookingDate instanceof Date
        ? new Date(`${newBooking.bookingDate.toISOString().split('T')[0]}T${newBooking.bookingTime}:00`)
        : new Date(`${newBooking.bookingDate}T${newBooking.bookingTime}:00`);

      const eventDuration = await this.getServiceDuration(newBooking.userId, newBooking.serviceId.toString());
      const endDate = new Date(startDate.getTime() + (eventDuration * 60 * 1000));

      const eventTitle = `Réservation: ${newBooking.userContactFirstname} ${newBooking.userContactLastname}`;

      const updateBody = {
        subject: eventTitle,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: 'Europe/Paris'
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'Europe/Paris'
        },
        body: {
          contentType: 'html',
          content: this.generateEventDescription({
            userId: newBooking.userId.toString(),
            serviceId: newBooking.serviceId.toString(),
            bookingDate: newBooking.bookingDate,
            bookingTime: newBooking.bookingTime,
            participantsAdults: newBooking.participantsAdults,
            participantsEnfants: newBooking.participantsEnfants,
            selectedLanguage: newBooking.selectedLanguage,
            userContactFirstname: newBooking.userContactFirstname,
            userContactLastname: newBooking.userContactLastname,
            customerEmail: newBooking.customerEmail,
            phoneNo: newBooking.phoneNo,
            additionalNotes: newBooking.additionalNotes,
            paymentMethod: newBooking.paymentMethod
          } as CreateBookingDto)
        },
        attendees: [
          {
            emailAddress: {
              address: newBooking.customerEmail,
              name: `${newBooking.userContactFirstname} ${newBooking.userContactLastname}`
            },
            type: 'required'
          }
        ]
      };

      // Update event via Microsoft Graph API
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${newBooking.microsoftEventId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateBody)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Microsoft Graph API update error: ${response.status} - ${errorData}`);
      }

      console.log('✅ Successfully updated event in Microsoft calendar');

    } catch (error) {
      console.error('❌ Microsoft calendar update error:', error);
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

      // Send cancellation email to customer only
      setImmediate(async () => {
        try {
          const user = await this.userModel.findById(booking.userId);
          const domainProfile = await this.domainProfileModel.findOne({ userId: booking.userId });

          console.log('Debug DELETE - serviceId:', booking.serviceId?.toString());
          console.log('Debug DELETE - domainProfile services:', domainProfile?.services);

          // Find the service info from domain profile using _id
          const service = domainProfile?.services?.find(s => {
            console.log('Debug DELETE - service s:', s);
            console.log('Debug DELETE - service s._id:', (s as any)._id);
            console.log('Debug DELETE - comparison:', (s as any)._id?.toString() === booking.serviceId?.toString());
            return (s as any)._id?.toString() === booking.serviceId?.toString();
          });

          console.log('Debug DELETE - final service found:', service);

          const bookingEmailData: BookingEmailData = {
            customerName: `${booking.userContactFirstname} ${booking.userContactLastname}`,
            customerEmail: booking.customerEmail,
            providerName: user ? `${user.firstName} ${user.lastName}` : 'Rose des Vins',
            providerEmail: user ? user.email : 'admin@rosedesvins.com',
            eventTitle: service?.name || 'Dégustation de vins',
            eventDate: new Date(booking.bookingDate).toLocaleDateString('fr-FR'),
            eventTime: booking.bookingTime,
            eventTimezone: 'CET',
            eventDuration: service?.timeOfServiceInMinutes ? `${service.timeOfServiceInMinutes} minutes` : '60 minutes',
            participantsAdults: booking.participantsAdults,
            participantsChildren: booking.participantsEnfants || 0,
            selectedLanguage: booking.selectedLanguage,
            additionalNotes: booking.additionalNotes,
            // Enhanced template data
            domainName: user?.domainName || 'Domaine La Bastide Blanche',
            domainAddress: user?.address && user?.codePostal && user?.city
              ? `${user.address} - ${user.codePostal} - ${user.city}`
              : '367, Route des Oratoires - 83330 - Sainte-Anne du Castellet',
            domainLogoUrl: domainProfile?.domainLogoUrl || 'https://rosedesvins.co/assets/logo.png',
            serviceName: service?.name || 'Visite de cave et dégustation de vins',
            serviceDescription: service?.description || 'Une expérience unique avec la visite libre de notre cave troglodytique sculptée, suivie d\'une dégustation commentée de 5 vins dans notre caveau à l\'ambiance feutrée, éclairé à la bougie.',
            totalPrice: service?.pricePerPerson ? `${service.pricePerPerson} €` : '20 €',
            paymentMethod: 'Paiement sur place (cartes, chèques, liquide)',
            frontendUrl: this.configService.get('FRONTEND_URL') || 'https://rosedesvins.co',
            appLogoUrl: this.configService.get('APP_LOGO') || 'https://rosedesvins.co/assets/logo.png',
            backendUrl: this.configService.get('BACKEND_URL') || 'http://localhost:3000',
            serviceBannerUrl: service?.serviceBannerUrl || '/uploads/default-service-banner.jpg',
          };

          // Fix URLs to avoid double slashes
          bookingEmailData.domainLogoUrl = this.joinUrl(this.configService.get('BACKEND_URL') || 'http://localhost:3000', domainProfile?.domainLogoUrl || '/assets/logo.png');
          bookingEmailData.serviceBannerUrl = this.joinUrl(this.configService.get('BACKEND_URL') || 'http://localhost:3000', service?.serviceBannerUrl || '/uploads/default-service-banner.jpg');

          // Send cancellation notification to customer only
          await this.sendCustomerBookingEmail(bookingEmailData, 'cancelled');
        } catch (emailError) {
          console.error('Failed to send cancellation email:', emailError);
          // Don't fail the deletion if email fails
        }
      });

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

      // Find the active connector based on connector_name
      const activeConnector = connectors.find(conn =>
        conn.connector_name !== 'none'
      );

      if (!activeConnector) {
        console.log('ℹ️ No active calendar connector found for deletion');
        return;
      }

      // Route to appropriate calendar based on connector_name
      switch (activeConnector.connector_name) {
        case 'orange':
          if (activeConnector.connector_creds?.orange?.isActive && activeConnector.connector_creds?.orange?.isValid) {
            console.log('🍊 Deleting from Orange calendar');
            await this.deleteFromOrangeCalendar(booking, activeConnector.connector_creds.orange);
          }
          break;

        case 'microsoft':
          if (activeConnector.connector_creds?.microsoft?.isActive && activeConnector.connector_creds?.microsoft?.isValid) {
            console.log('🟦 Deleting from Microsoft calendar');
            await this.deleteFromMicrosoftCalendar(booking, activeConnector.connector_creds.microsoft);
          }
          break;

        case 'ovh':
          console.log('ℹ️ OVH calendar deletion not yet implemented');
          break;

        default:
          console.log('ℹ️ No supported calendar provider found for deletion');
      }

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

  /**
   * Delete booking event from Microsoft Calendar using Graph API
   */
  private async deleteFromMicrosoftCalendar(booking: any, microsoftCreds: any): Promise<void> {
    try {
      console.log('🟦 Deleting from Microsoft calendar for booking:', booking._id);

      // Check if we have a Microsoft event ID to delete
      if (!booking.microsoftEventId) {
        console.log('ℹ️ No Microsoft event ID found for booking, nothing to delete');
        return;
      }

      // Get a valid access token
      const accessToken = await this.connectorService.getMicrosoftAccessToken(booking.userId.toString());

      if (!accessToken) {
        throw new Error('Failed to get valid Microsoft access token');
      }

      // Delete event via Microsoft Graph API
      const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${booking.microsoftEventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.status === 404) {
        console.log('ℹ️ Microsoft event not found (may have been already deleted)');
        return;
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Microsoft Graph API delete error: ${response.status} - ${errorData}`);
      }

      console.log('✅ Successfully deleted event from Microsoft calendar');

    } catch (error) {
      console.error('❌ Microsoft calendar deletion error:', error);
      throw error;
    }
  }
}
