import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Event } from '../schemas/events.schema';
import { NotificationPreferences } from '../schemas/notification-preferences.schema';
import { User } from '../schemas/user.schema';

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
    ) { }

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
            }).populate('userId').exec();

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
        const eventDateTime = this.combineDateTime(event.eventDate, event.eventTime);
        const timeUntilEvent = this.getTimeUntilEvent(eventDateTime);

        console.log('\n🔔 CUSTOMER NOTIFICATION:');
        console.log('=====================================');
        console.log(`📧 To: ${event.userId.email}`);
        console.log(`👤 Customer: ${event.userId.firstName} ${event.userId.lastName}`);
        console.log(`🎯 Event: ${event.eventName}`);
        console.log(`📅 Date: ${event.eventDate.toDateString()}`);
        console.log(`⏰ Time: ${event.eventTime} (${DEFAULT_TIMEZONE})`);
        console.log(`🌍 Event DateTime: ${this.formatDateTimeForDisplay(eventDateTime)}`);
        console.log(`⏳ Time until event: ${timeUntilEvent}`);
        console.log(`🔔 Notification preference: ${preferences.customerNotificationBefore}`);
        console.log(`📝 Description: ${event.eventDescription || 'No description'}`);
        console.log(`🕐 Timezone: ${DEFAULT_TIMEZONE}`);
        console.log('=====================================\n');

        // Here you would integrate with email/SMS service
        // await this.emailService.sendCustomerReminder(event, preferences);
        // await this.smsService.sendCustomerReminder(event, preferences);
    }

    /**
     * Send notification to provider (domain owner)
     */
    private async sendProviderNotification(event: any, preferences: any): Promise<void> {
        const eventDateTime = this.combineDateTime(event.eventDate, event.eventTime);
        const timeUntilEvent = this.getTimeUntilEvent(eventDateTime);

        console.log('\n🔔 PROVIDER NOTIFICATION:');
        console.log('=====================================');
        console.log(`🏢 Provider notification for booking`);
        console.log(`👤 Customer: ${event.userId.firstName} ${event.userId.lastName}`);
        console.log(`📧 Customer Email: ${event.userId.email}`);
        console.log(`🎯 Event: ${event.eventName}`);
        console.log(`📅 Date: ${event.eventDate.toDateString()}`);
        console.log(`⏰ Time: ${event.eventTime} (${DEFAULT_TIMEZONE})`);
        console.log(`🌍 Event DateTime: ${this.formatDateTimeForDisplay(eventDateTime)}`);
        console.log(`⏳ Time until event: ${timeUntilEvent}`);
        console.log(`🔔 Notification preference: ${preferences.providerNotificationBefore}`);
        console.log(`📝 Description: ${event.eventDescription || 'No description'}`);
        console.log(`🕐 Timezone: ${DEFAULT_TIMEZONE}`);
        console.log('=====================================\n');

        // Here you would send notification to domain owner
        // await this.emailService.sendProviderReminder(event, preferences);
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
}
