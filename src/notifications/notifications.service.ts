import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Event } from '../schemas/events.schema';
import { NotificationPreferences } from '../schemas/notification-preferences.schema';
import { User } from '../schemas/user.schema';
import { UserBooking } from '../schemas/user-bookings.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { PaymentMethods } from '../schemas/payment-methods.schema';
import { EmailService, EmailJob } from '../email/email.service';
import { TemplateService } from '../email/template.service';

// Notification timing constants
const NOTIFICATION_OPTIONS = {
    ONE_HOUR: '1_hour',
    TWO_HOURS: '2_hours',
    DAY_BEFORE: 'day_before',
    LAST_MINUTE: 'last_minute',
    NEVER: 'never'
};

// Default timezone for notifications (can be easily changed)
const DEFAULT_TIMEZONE = 'Europe/Paris';

/**
 * NotificationsService - Handles dynamic event notifications
 * 
 * TIMEZONE CONFIGURATION:
 * - To change timezone: Update DEFAULT_TIMEZONE constant at the top of this file
 * - Current timezone: Europe/Paris (France)
 * - All notifications and timing calculations use this timezone
 * 
 * Supported timezones: Any IANA timezone identifier
 * Examples: 'UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo'
 */
@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(NotificationPreferences.name) private notificationPreferencesModel: Model<NotificationPreferences>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(UserBooking.name) private userBookingModel: Model<UserBooking>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
    @InjectModel(PaymentMethods.name) private paymentMethodsModel: Model<PaymentMethods>,
    private emailService: EmailService,
    private templateService: TemplateService,
  ) {}

    /**
     * Cron job that runs every 30 minutes to check for upcoming events
     * and send notifications based on user preferences
     */
    @Cron(CronExpression.EVERY_30_MINUTES) // Every 30 minutes
    async handleNotificationCron() {
        this.logger.log('🔔 Notification cron job started - Checking for upcoming events...');

        try {
            await this.checkAndSendNotifications();
            this.logger.log('✅ Notification cron job completed successfully');
        } catch (error) {
            this.logger.error('❌ Error in notification cron job:', error);
        }
    }

    /**
     * Main method to check for upcoming events and send notifications
     */
    async checkAndSendNotifications(): Promise<void> {
        try {
            // Get all active booking events for the next 24 hours in target timezone
            const nowInTargetTimezone = this.getCurrentTimeInTimezone(DEFAULT_TIMEZONE);

            const today = new Date(nowInTargetTimezone);
            today.setHours(0, 0, 0, 0);

            const tomorrow = new Date(nowInTargetTimezone);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(23, 59, 59, 999);

            this.logger.log(`🌍 Using timezone: ${DEFAULT_TIMEZONE}`);
            this.logger.log(`📅 Looking for events from ${today.toISOString()} to ${tomorrow.toISOString()}`);

            const upcomingEvents = await this.eventModel.find({
                eventType: 'booking',
                eventStatus: 'active',
                eventDate: {
                    $gte: today,
                    $lte: tomorrow
                }
            }).populate('userId').populate('bookingId').exec();

            this.logger.log(`📅 Found ${upcomingEvents.length} upcoming booking events to check`);

            // Process each event
            for (const event of upcomingEvents) {
                await this.processEventNotification(event);
            }

        } catch (error) {
            this.logger.error('❌ Error checking notifications:', error);
            throw error;
        }
    }

    /**
     * Process notification for a single event
     */
    private async processEventNotification(event: any): Promise<void> {
        try {
            // Get user's notification preferences
            const preferences = await this.notificationPreferencesModel.findOne({
                userId: event.userId._id.toString()
            }).exec();

            if (!preferences) {
                this.logger.warn(`⚠️ No notification preferences found for user ${event.userId._id}`);
                return;
            }

            // Calculate notification times using target timezone
            const eventDateTime = this.combineDateTime(event.eventDate, event.eventTime);
            const now = this.getCurrentTimeInTimezone(DEFAULT_TIMEZONE);

            console.log(`Event DateTime (${DEFAULT_TIMEZONE}):`, eventDateTime);
            console.log(`Current Time (${DEFAULT_TIMEZONE}):`, now);
            console.log(`Timezone used: ${DEFAULT_TIMEZONE}`);

            // Check customer notification
            const customerNotificationTime = this.calculateNotificationTime(
                eventDateTime,
                preferences.customerNotificationBefore
            );

            // Check provider notification
            const providerNotificationTime = this.calculateNotificationTime(
                eventDateTime,
                preferences.providerNotificationBefore
            );

            console.log(`Customer Notification Time: ${customerNotificationTime} | Provider Notification Time: ${providerNotificationTime}`);

            // Send customer notification if it's time
            if (this.shouldSendNotification(now, customerNotificationTime, eventDateTime)) {
                await this.sendCustomerNotification(event, preferences);
            }

            // Send provider notification if it's time
            if (this.shouldSendNotification(now, providerNotificationTime, eventDateTime)) {
                await this.sendProviderNotification(event, preferences);
            }

        } catch (error) {
            this.logger.error(`❌ Error processing notification for event ${event._id}:`, error);
        }
    }

    /**
     * Combine event date and time into a single Date object using the default timezone
     */
    private combineDateTime(eventDate: Date, eventTime: string): Date {
        const [hours, minutes] = eventTime.split(':').map(Number);

        // Get the date in YYYY-MM-DD format
        const dateString = eventDate.toISOString().split('T')[0];

        // Create the date/time in the target timezone
        // This assumes the event time is already in the target timezone
        const year = parseInt(dateString.split('-')[0]);
        const month = parseInt(dateString.split('-')[1]) - 1; // Month is 0-indexed
        const day = parseInt(dateString.split('-')[2]);

        // Create date in local time (which represents the target timezone time)
        const combinedDate = new Date(year, month, day, hours, minutes, 0, 0);

        this.logger.debug(`🕐 Combined DateTime: ${dateString} ${eventTime} (${DEFAULT_TIMEZONE}) -> ${combinedDate.toISOString()}`);

        return combinedDate;
    }

    /**
     * Convert a UTC date to the target timezone
     */
    private convertToTimezone(utcDate: Date, timezone: string = DEFAULT_TIMEZONE): Date {
        try {
            // Use Intl.DateTimeFormat to get the time in target timezone
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            const parts = formatter.formatToParts(utcDate);
            const partsMap = parts.reduce((acc, part) => {
                acc[part.type] = part.value;
                return acc;
            }, {} as any);

            // Create new date in the target timezone
            const targetDate = new Date(
                parseInt(partsMap.year),
                parseInt(partsMap.month) - 1, // Month is 0-indexed
                parseInt(partsMap.day),
                parseInt(partsMap.hour),
                parseInt(partsMap.minute),
                parseInt(partsMap.second)
            );

            return targetDate;
        } catch (error) {
            this.logger.error(`Error converting to timezone ${timezone}:`, error);
            return utcDate; // Fallback to original date
        }
    }

    /**
     * Get current time in the target timezone
     */
    private getCurrentTimeInTimezone(timezone: string = DEFAULT_TIMEZONE): Date {
        const now = new Date();
        return this.convertToTimezone(now, timezone);
    }

    /**
     * Calculate when to send notification based on preference
     */
    private calculateNotificationTime(eventDateTime: Date, notificationBefore: string): Date {
        const notificationTime = new Date(eventDateTime);

        switch (notificationBefore) {
            case NOTIFICATION_OPTIONS.ONE_HOUR:
                notificationTime.setHours(notificationTime.getHours() - 1);
                break;
            case NOTIFICATION_OPTIONS.TWO_HOURS:
                notificationTime.setHours(notificationTime.getHours() - 2);
                break;
            case NOTIFICATION_OPTIONS.DAY_BEFORE:
                notificationTime.setDate(notificationTime.getDate() - 1);
                break;
            case NOTIFICATION_OPTIONS.LAST_MINUTE:
                notificationTime.setMinutes(notificationTime.getMinutes() - 5); // 5 minutes before
                break;
            case NOTIFICATION_OPTIONS.NEVER:
                return new Date(0); // Never send
            default:
                notificationTime.setHours(notificationTime.getHours() - 1); // Default to 1 hour
        }

        return notificationTime;
    }

    /**
     * Check if we should send notification now
     * (within 30-minute window to account for cron frequency)
     */
    private shouldSendNotification(now: Date, notificationTime: Date, eventDateTime: Date): boolean {
        // Don't send if never option or if event has already passed
        if (notificationTime.getTime() === 0 || eventDateTime <= now) {
            console.log(`❌ Not sending notification: ${notificationTime.getTime() === 0 ? 'Never option' : 'Event has passed'}`);
            return false;
        }

        // Send if current time is within 30 minutes of notification time
        const timeDiff = Math.abs(now.getTime() - notificationTime.getTime());
        const thirtyMinutes = 30 * 60 * 1000; // 30 minutes in milliseconds
        const shouldSend = timeDiff <= thirtyMinutes && now >= notificationTime;

        console.log(`🔔 Notification timing check (${DEFAULT_TIMEZONE}):`);
        console.log(`   Current time: ${now.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE })}`);
        console.log(`   Notification time: ${notificationTime.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE })}`);
        console.log(`   Event time: ${eventDateTime.toLocaleString('en-US', { timeZone: DEFAULT_TIMEZONE })}`);
        console.log(`   Time difference: ${Math.round(timeDiff / 1000 / 60)} minutes`);
        console.log(`   Should send: ${shouldSend}`);

        return shouldSend;
    }

    /**
     * Send notification to customer
     */
    private async sendCustomerNotification(event: any, preferences: any): Promise<void> {
        try {
            console.log(event);
            const eventDateTime = this.combineDateTime(event.eventDate, event.eventTime);
            const timeUntilEvent = this.getTimeUntilEvent(eventDateTime);

            // Format date for display
            const eventDateFormatted = event.eventDate.toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });

            // Get hours before event for notification
            const hoursBeforeEvent = this.getHoursFromNotificationSetting(preferences.customerNotificationBefore);
            
            if(hoursBeforeEvent === 0) {
                return 
            }

            // Get booking details to access customer information
            const booking = event.bookingId;
            if (!booking) {
                console.log('❌ No booking data found for event, skipping customer notification');
                return;
            }

            // Get customer info from booking data
            const customerName = `${booking.userContactFirstname} ${booking.userContactLastname}`;
            const customerEmail = booking.customerEmail;

            // Get additional data for enhanced template (similar to booking confirmation)
            const provider = event.userId;
            const frontendUrl = 'https://rosedesvins.co';
            const backendUrl = 'https://api.rosedesvins.co';
            
            // Get domain profile for additional details
            const domain = await this.domainProfileModel.findOne({
                userId: provider._id,
            }).exec();
  
            // Get service details from domain profile
            const service = domain?.services?.find(s =>
                // @ts-ignore 
                s._id.toString() === booking.serviceId.toString()
            );

            // Calculate cancel booking URL
            const cancelBookingUrl = `${frontendUrl}/cancel-booking/${booking._id}`;
            
            // Get payment methods for the user
            const paymentMethod = await this.getUserPaymentMethods(provider._id);

            // Get user info for domain name (from User model)
            const userInfo = await this.userModel.findById(provider._id).exec();
            const domainName = userInfo ? `${userInfo.domainName}` : 'Rose des Vins';

            // Prepare email data
            const emailData = {
                customerName: customerName,
                customerEmail: customerEmail,
                eventTitle: event.eventName,
                eventDate: eventDateFormatted,
                eventTime: event.eventTime,
                eventTimezone: DEFAULT_TIMEZONE,
                eventDuration: service?.timeOfServiceInMinutes ? `${service.timeOfServiceInMinutes} minutes` : '60 minutes',
                eventLocation: event.location || 'Rose des Vins',
                eventDescription: event.eventDescription || service?.description,
                providerName: domainName,
                hoursBeforeEvent: hoursBeforeEvent,
                // Enhanced fields for booking-style template
                domainName: domainName,
                domainAddress: '', // Domain profile doesn't have address field
                domainLogoUrl: domain?.domainLogoUrl ? `${backendUrl}${domain.domainLogoUrl}` : `${backendUrl}/assets/logo.png`,
                serviceName: service?.name || event.eventName,
                serviceDescription: service?.description || event.eventDescription,
                participantsAdults: booking.participantsAdults || 1,
                participantsChildren: booking.participantsEnfants || 0,
                selectedLanguage: booking.selectedLanguage || 'Français',
                numberOfWinesTasted: service?.numberOfWinesTasted || 3,
                totalPrice: service?.pricePerPerson ? `${service.pricePerPerson * (booking.participantsAdults + booking.participantsEnfants || 0)}€` : 'Prix sur demande',
                paymentMethod: paymentMethod,
                frontendUrl: frontendUrl,
                appLogoUrl: `${frontendUrl}/assets/logo.png`,
                backendUrl: backendUrl,
                serviceBannerUrl: service?.serviceBannerUrl ? `${backendUrl}${service.serviceBannerUrl}` : `${backendUrl}/uploads/default-service-banner.jpg`,
                cancelBookingUrl: cancelBookingUrl,
                additionalNotes: booking.additionalNotes || null,
            };

            // Generate email HTML
            const emailHtml = this.templateService.generateCustomerNotificationEmail(emailData);

            // Send email to customer
            const emailJob: EmailJob = {
                to: customerEmail,
                subject: `Rappel : Votre expérience œnologique "${service?.name}" dans ${hoursBeforeEvent} heures`,
                html: emailHtml,
            };
            await this.emailService.sendEmail(emailJob);

            console.log(`✅ Customer notification email sent successfully:
                📧 To: ${customerEmail} (${customerName})
                🎯 Event: ${event.eventName}
                ⏰ Time: ${event.eventTime} (${DEFAULT_TIMEZONE})
                ⌛ Notice: ${hoursBeforeEvent} hours before event`);

        } catch (error) {
            console.error(`❌ Failed to send customer notification email:`, error);
            
            // Fallback to console notification if email fails
            const eventDateTime = this.combineDateTime(event.eventDate, event.eventTime);
            console.log('\n� FALLBACK CUSTOMER NOTIFICATION:');
            console.log('=====================================');
            console.log(`📧 To: ${event.userId.email}`);
            console.log(`👤 Customer: ${event.userId.firstName} ${event.userId.lastName}`);
            console.log(`🎯 Event: ${event.eventName}`);
            console.log(`📅 Date: ${event.eventDate.toDateString()}`);
            console.log(`⏰ Time: ${event.eventTime} (${DEFAULT_TIMEZONE})`);
            console.log('=====================================\n');
        }
    }

    /**
     * Send notification to provider (domain owner)
     */
    private async sendProviderNotification(event: any, preferences: any): Promise<void> {
        try {
            const eventDateTime = this.combineDateTime(event.eventDate, event.eventTime);
            
            // Format date for display
            const eventDateFormatted = event.eventDate.toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });

            // Get hours before event for notification
            const hoursBeforeEvent = this.getHoursFromNotificationSetting(preferences.providerNotificationBefore);

            if(hoursBeforeEvent === 0) {
                return 
            }

            // Get booking details to access customer information
            const booking = event.bookingId;
            if (!booking) {
                console.log('❌ No booking data found for event, skipping provider notification');
                return;
            }

            // Provider is the wine business owner (event.userId)
            const provider = event.userId;
            const providerEmail = provider.email;
            const providerName = `${provider.firstName} ${provider.lastName}`;

            // Customer info comes from booking data
            const customerName = `${booking.userContactFirstname} ${booking.userContactLastname}`;

            // Get additional data for enhanced template (similar to booking confirmation)
            const frontendUrl = 'https://rosedesvins.co';
            const backendUrl = 'https://api.rosedesvins.co';
            
            // Get domain profile for additional details
            const domain = await this.domainProfileModel.findOne({
                userId: provider._id
            }).exec();
            
            // Get service details from domain profile
            const service = domain?.services?.find(s => 
                // @ts-ignore 
                s._id.toString() === booking.serviceId.toString()
            );

            // Get payment methods for the user
            const paymentMethod = await this.getUserPaymentMethods(provider._id);

            // Get user info for domain name (from User model)
            const userInfo = await this.userModel.findById(provider._id).exec();
            const domainName = userInfo ? `${userInfo.domainName}` : 'Rose des Vins';

            // Prepare email data
            const emailData = {
                providerName: providerName,
                providerEmail: providerEmail,
                customerName: customerName,
                eventTitle: event.eventName,
                eventDate: eventDateFormatted,
                eventTime: event.eventTime,
                eventTimezone: DEFAULT_TIMEZONE,
                eventDuration: service?.timeOfServiceInMinutes ? `${service.timeOfServiceInMinutes} minutes` : '60 minutes',
                eventLocation: event.location || 'Rose des Vins',
                eventDescription: event.eventDescription || service?.description,
                hoursBeforeEvent: hoursBeforeEvent,
                eventName: event.eventName,
                // Enhanced fields for booking-style template
                domainName: domainName,
                domainAddress: '', // Domain profile doesn't have address field
                domainLogoUrl: domain?.domainLogoUrl ? `${backendUrl}${domain.domainLogoUrl}` : `${backendUrl}/assets/logo.png`,
                serviceName: service?.name,
                serviceDescription: service?.description || event.eventDescription,
                participantsAdults: booking.participantsAdults || 1,
                participantsChildren: booking.participantsEnfants || 0,
                selectedLanguage: booking.selectedLanguage || 'Français',
                numberOfWinesTasted: service?.numberOfWinesTasted || 3,
                totalPrice: service?.pricePerPerson ? `${service.pricePerPerson * (booking.participantsAdults + booking.participantsEnfants || 0)}€` : 'Prix sur demande',
                paymentMethod: paymentMethod,
                frontendUrl: frontendUrl,
                appLogoUrl: `${frontendUrl}/assets/logo.png`,
                backendUrl: backendUrl,
                serviceBannerUrl: service?.serviceBannerUrl ? `${backendUrl}${service.serviceBannerUrl}` : `${backendUrl}/uploads/default-service-banner.jpg`,
                customerEmail: booking.customerEmail,
                additionalNotes: booking.additionalNotes || null,
            };

            // Generate email HTML
            const emailHtml = this.templateService.generateProviderNotificationEmail(emailData);

            // Send email
            const emailJob: EmailJob = {
                to: providerEmail,
                subject: `Expérience client à venir : ${service?.name} dans ${hoursBeforeEvent} heures`,
                html: emailHtml,
            };
            await this.emailService.sendEmail(emailJob);

            console.log(`✅ Provider notification email sent successfully:
                � To: ${providerEmail} (${providerName})
                👤 Guest: ${event.userId.firstName} ${event.userId.lastName}
                🎯 Event: ${event.eventName}
                ⏰ Time: ${event.eventTime} (${DEFAULT_TIMEZONE})
                ⌛ Notice: ${hoursBeforeEvent} hours before event`);

        } catch (error) {
            console.error(`❌ Failed to send provider notification email:`, error);
            
            // Fallback to console notification if email fails
            const eventDateTime = this.combineDateTime(event.eventDate, event.eventTime);
            console.log('\n🔔 FALLBACK PROVIDER NOTIFICATION:');
            console.log('=====================================');
            console.log(`🏢 Provider notification for booking`);
            console.log(`👤 Customer: ${event.userId.firstName} ${event.userId.lastName}`);
            console.log(`� Customer Email: ${event.userId.email}`);
            console.log(`🎯 Event: ${event.eventName}`);
            console.log(`� Date: ${event.eventDate.toDateString()}`);
            console.log(`⏰ Time: ${event.eventTime} (${DEFAULT_TIMEZONE})`);
            console.log('=====================================\n');
        }
    }

    /**
     * Get human-readable time until event
     */
    private getTimeUntilEvent(eventDateTime: Date): string {
        const now = new Date();
        const diffMs = eventDateTime.getTime() - now.getTime();

        if (diffMs <= 0) return 'Event has passed';

        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        if (diffHours > 0) {
            return `${diffHours} hours and ${diffMinutes} minutes`;
        } else {
            return `${diffMinutes} minutes`;
        }
    }

    /**
     * Get the current default timezone
     */
    getDefaultTimezone(): string {
        return DEFAULT_TIMEZONE;
    }

    /**
     * Format date/time for display in the target timezone
     */
    private formatDateTimeForDisplay(date: Date, timezone: string = DEFAULT_TIMEZONE): string {
        return date.toLocaleString('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    /**
     * Get formatted payment methods for a user
     * @param userId - User ID to fetch payment methods for
     * @returns Formatted payment methods string
     */
    private async getUserPaymentMethods(userId: Types.ObjectId): Promise<string> {
        try {
            const paymentMethods = await this.paymentMethodsModel
                .findOne({ userId })
                .lean()
                .exec();

            if (paymentMethods && paymentMethods.methods.length > 0) {
                return this.formatPaymentMethodsForEmail(paymentMethods.methods);
            }

            // Default fallback if no payment methods found
            return 'Paiement sur place (Carte bancaire, Chèques, Espèces)';
        } catch (error) {
            console.warn('Could not fetch payment methods for user:', userId, error);
            return 'Paiement sur place (Carte bancaire, Chèques, Espèces)';
        }
    }

    /**
     * Format payment methods for email display
     * @param methods - Array of payment method strings from database
     * @returns Formatted string for email display
     */
    private formatPaymentMethodsForEmail(methods: string[]): string {
        if (!methods || methods.length === 0) {
            return 'Paiement sur place (Carte bancaire, Chèques, Espèces)'; // Default fallback
        }

        const methodTranslations: { [key: string]: string } = {
            'bank card': 'Carte bancaire',
            'checks': 'Chèques', 
            'cash': 'Espèces'
        };

        const translatedMethods = methods
            .map(method => methodTranslations[method] || method)
            .join(', ');

        return `Paiement sur place (${translatedMethods})`;
    }

    /**
     * Convert notification setting to hours
     */
    private getHoursFromNotificationSetting(setting: string): number {
        switch (setting) {
            case '15min':
                return 0.25;
            case '30min':
                return 0.5;
            case '1hr':
                return 1;
            case '2hr':
                return 2;
            case '4hr':
                return 4;
            case '1day':
                return 24;
            case '2day':
                return 48;
            case '1_hour':
                return 1;
            case '2_hours':
                return 2;
            case 'day_before':
                return 24;
            case 'last_minute':
                return 0.0833; // 5 minutes
            case 'never':
                return 0;
            default:
                return 2; // Default to 2 hours
        }
    }

    /**
     * Manual method to test notifications for specific events
     */
    async testNotificationForEvent(eventId: string): Promise<void> {
        try {
            const event = await this.eventModel.findById(eventId).populate('userId').exec();

            if (!event) {
                this.logger.error(`Event not found: ${eventId}`);
                return;
            }

            if (event.eventType !== 'booking') {
                this.logger.warn(`Event ${eventId} is not a booking event`);
                return;
            }

            this.logger.log(`🧪 Testing notification for event: ${event.eventName}`);
            await this.processEventNotification(event);

        } catch (error) {
            this.logger.error(`Error testing notification for event ${eventId}:`, error);
        }
    }

    /**
     * Send test notification emails for specific event (both customer and provider)
     */
    async sendTestNotificationEmails(eventId: string): Promise<any> {
        try {
            // Find the event and populate user details and booking details
            const event = await this.eventModel.findById(eventId).populate('userId').populate('bookingId').exec();

            if (!event) {
                throw new Error(`Event not found: ${eventId}`);
            }

            if (event.eventType !== 'booking') {
                throw new Error(`Event ${eventId} is not a booking event`);
            }

            this.logger.log(`📧 Sending test notification emails for event: ${event.eventName}`);

            // Find user's notification preferences (or use defaults)
            let preferences = await this.notificationPreferencesModel
                .findOne({ userId: event.userId._id.toString() })
                // .populate('domainId')
                .exec();

            console.log('User notification preferences:', preferences);

            // If no preferences found, create default preferences object for testing
            // if (!preferences) {
            //     preferences = {
            //         userId: event.userId._id,
            //         customerNotificationBefore: '2_hours' as any,
            //         providerNotificationBefore: '2_hours' as any,
            //     } as any;
            //     this.logger.warn(`No notification preferences found for user ${event.userId._id}, using defaults`);
            // }

            // Get booking and user data
            const booking = event.bookingId as any;
            const provider = event.userId as any;

            if (!booking) {
                throw new Error(`No booking data found for event ${eventId}`);
            }

            const results = {
                eventDetails: {
                    id: event._id,
                    name: event.eventName,
                    date: event.eventDate,
                    time: event.eventTime,
                    provider: `${provider.firstName} ${provider.lastName}`,
                    providerEmail: provider.email,
                    customer: `${booking.userContactFirstname} ${booking.userContactLastname}`,
                    customerEmail: booking.customerEmail
                },
                emailsSent: [] as any[]
            };

            // Send customer notification email
            try {
                await this.sendCustomerNotification(event, preferences);
                results.emailsSent.push({
                    type: 'customer',
                    to: booking.customerEmail,
                    status: 'success',
                    message: 'Customer notification email sent successfully'
                });
            } catch (error) {
                results.emailsSent.push({
                    type: 'customer',
                    to: booking.customerEmail,
                    status: 'error',
                    message: error.message
                });
            }

            // Send provider notification email
            try {
                await this.sendProviderNotification(event, preferences);
                results.emailsSent.push({
                    type: 'provider',
                    to: provider.email,
                    status: 'success',
                    message: 'Provider notification email sent successfully'
                });
            } catch (error) {
                results.emailsSent.push({
                    type: 'provider',
                    to: provider.email,
                    status: 'error',
                    message: error.message
                });
            }

            return results;

        } catch (error) {
            this.logger.error(`Error sending test notification emails for event ${eventId}:`, error);
            throw error;
        }
    }

    /**
     * Send quick test emails with mock data (useful for testing without real events)
     */
    async sendQuickTestEmails(email: string): Promise<any> {
        try {
            this.logger.log(`📧 Sending quick test notification emails to: ${email}`);

            // Create mock event data for testing
            const mockEventDate = new Date();
            mockEventDate.setDate(mockEventDate.getDate() + 1); // Tomorrow

            const mockEvent = {
                _id: 'mock-event-id',
                eventName: 'Wine Tasting Experience - Test Event',
                eventDate: mockEventDate,
                eventTime: '18:00',
                eventDescription: 'This is a test email for our wine tasting experience. Discover exceptional wines in our beautiful vineyard setting.',
                location: 'Rose des Vins Vineyard',
                userId: {
                    _id: 'mock-user-id',
                    firstName: 'John',
                    lastName: 'Doe',
                    email: email
                }
            };

            const results = {
                testData: {
                    eventName: mockEvent.eventName,
                    eventDate: mockEvent.eventDate.toLocaleDateString('fr-FR'),
                    eventTime: mockEvent.eventTime,
                    recipientEmail: email,
                    testType: 'Mock data test'
                },
                emailsSent: [] as any[]
            };

            // Send customer notification email
            try {
                // Format date for display
                const eventDateFormatted = mockEvent.eventDate.toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });

                // Prepare customer email data with enhanced fields
                const frontendUrl = 'https://rosedesvins.co';
                const backendUrl = 'https://api.rosedesvins.co';
                
                const customerEmailData = {
                    customerName: `${mockEvent.userId.firstName} ${mockEvent.userId.lastName}`,
                    customerEmail: mockEvent.userId.email,
                    eventTitle: mockEvent.eventName,
                    eventDate: eventDateFormatted,
                    eventTime: mockEvent.eventTime,
                    eventTimezone: DEFAULT_TIMEZONE,
                    eventDuration: '60 minutes',
                    eventLocation: mockEvent.location,
                    eventDescription: mockEvent.eventDescription,
                    providerName: 'Rose des Vins Team',
                    hoursBeforeEvent: 24,
                    // Enhanced fields for booking-style template
                    domainName: 'Rose des Vins',
                    domainAddress: '123 Rue des Vignobles, 33000 Bordeaux',
                    domainLogoUrl: `${backendUrl}/assets/logo.png`,
                    serviceName: 'Découverte des Vins de Bordeaux',
                    serviceDescription: 'Une expérience unique de dégustation dans notre domaine historique. Découvrez nos meilleurs crus accompagnés d\'explications sur notre terroir.',
                    participantsAdults: 2,
                    participantsChildren: 0,
                    selectedLanguage: 'Français',
                    numberOfWinesTasted: 5,
                    totalPrice: '45€ par personne',
                    paymentMethod: 'Paiement sur place (Carte bancaire, Chèques, Espèces)',
                    frontendUrl: frontendUrl,
                    appLogoUrl: `${backendUrl}/assets/logo.png`,
                    backendUrl: backendUrl,
                    serviceBannerUrl: `${backendUrl}/uploads/default-service-banner.jpg`,
                    cancelBookingUrl: `${frontendUrl}/cancel-booking/mock-booking-id`,
                    additionalNotes: 'Merci de nous faire savoir si vous avez des allergies alimentaires.',
                };

                // Generate and send customer email
                const customerEmailHtml = this.templateService.generateCustomerNotificationEmail(customerEmailData);
                const customerEmailJob: EmailJob = {
                    to: email,
                    subject: `[TEST] Reminder: Your wine experience "${mockEvent.eventName}" is tomorrow`,
                    html: customerEmailHtml,
                };
                await this.emailService.sendEmail(customerEmailJob);

                results.emailsSent.push({
                    type: 'customer',
                    to: email,
                    status: 'success',
                    message: 'Customer notification test email sent successfully'
                });

                this.logger.log(`✅ Customer test email sent to: ${email}`);
            } catch (error) {
                results.emailsSent.push({
                    type: 'customer',
                    to: email,
                    status: 'error',
                    message: error.message
                });
                this.logger.error(`❌ Failed to send customer test email:`, error);
            }

            // Send provider notification email
            try {
                // Format date for display
                const eventDateFormatted = mockEvent.eventDate.toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });

                // Prepare provider email data with enhanced fields
                const frontendUrl = 'https://rosedesvins.co';
                const backendUrl = 'https://api.rosedesvins.co';
                
                const providerEmailData = {
                    providerName: 'Wine Experience Host',
                    providerEmail: email,
                    customerName: `${mockEvent.userId.firstName} ${mockEvent.userId.lastName}`,
                    eventTitle: mockEvent.eventName,
                    eventDate: eventDateFormatted,
                    eventTime: mockEvent.eventTime,
                    eventTimezone: DEFAULT_TIMEZONE,
                    eventDuration: '60 minutes',
                    eventLocation: mockEvent.location,
                    eventDescription: mockEvent.eventDescription,
                    hoursBeforeEvent: 24,
                    // Enhanced fields for booking-style template
                    domainName: 'Rose des Vins',
                    domainAddress: '123 Rue des Vignobles, 33000 Bordeaux',
                    domainLogoUrl: `${backendUrl}/assets/logo.png`,
                    serviceName: 'Découverte des Vins de Bordeaux',
                    serviceDescription: 'Une expérience unique de dégustation dans notre domaine historique. Découvrez nos meilleurs crus accompagnés d\'explications sur notre terroir.',
                    participantsAdults: 2,
                    participantsChildren: 0,
                    selectedLanguage: 'Français',
                    numberOfWinesTasted: 5,
                    totalPrice: '45€ par personne',
                    paymentMethod: 'Paiement sur place (Carte bancaire, Chèques, Espèces)',
                    frontendUrl: frontendUrl,
                    appLogoUrl: `${backendUrl}/assets/logo.png`,
                    backendUrl: backendUrl,
                    serviceBannerUrl: `${backendUrl}/uploads/default-service-banner.jpg`,
                    customerEmail: email,
                    additionalNotes: 'L\'invité a mentionné être amateur de vins rouges corsés.',
                };

                // Generate and send provider email
                const providerEmailHtml = this.templateService.generateProviderNotificationEmail(providerEmailData);
                const providerEmailJob: EmailJob = {
                    to: email,
                    subject: `[TEST] Upcoming Guest Experience: ${mockEvent.eventName} tomorrow`,
                    html: providerEmailHtml,
                };
                await this.emailService.sendEmail(providerEmailJob);

                results.emailsSent.push({
                    type: 'provider',
                    to: email,
                    status: 'success',
                    message: 'Provider notification test email sent successfully'
                });

                this.logger.log(`✅ Provider test email sent to: ${email}`);
            } catch (error) {
                results.emailsSent.push({
                    type: 'provider',
                    to: email,
                    status: 'error',
                    message: error.message
                });
                this.logger.error(`❌ Failed to send provider test email:`, error);
            }

            return results;

        } catch (error) {
            this.logger.error(`Error sending quick test emails to ${email}:`, error);
            throw error;
        }
    }
}
