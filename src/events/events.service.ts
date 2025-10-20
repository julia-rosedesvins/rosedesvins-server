import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event } from '../schemas/events.schema';
import { Connector } from '../schemas/connector.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { EncryptionService } from '../common/encryption.service';
import { Buffer } from 'buffer';
import { Cron, CronExpression } from '@nestjs/schedule';
const dav = require('dav');

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private calendarCache = new Map<string, { calendar: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
  ) { }

  /**
   * Get all events for a specific user
   * @param userId - User ID to get events for
   * @returns Promise with user's events
   */
  async getUserEvents(userId: string): Promise<Event[]> {
    try {
      const userObjectId = new Types.ObjectId(userId);

      // Get events with populated booking details
      const events = await this.eventModel
        .find({ userId: userObjectId })
        .populate('bookingId')
        .sort({ eventDate: 1, eventTime: 1 })
        .lean()
        .exec();

      // Get domain profile to access services information
      const domainProfile = await this.domainProfileModel
        .findOne({ userId: userObjectId })
        .lean()
        .exec();

      // Enhance events with service information
      const eventsWithServices = events.map(event => {
        if (event.bookingId && (event.bookingId as any).serviceId && domainProfile) {
          const serviceId = (event.bookingId as any).serviceId.toString();
          const service = domainProfile.services.find(s => (s as any)._id?.toString() === serviceId);
          
          if (service) {
            return {
              ...event,
              serviceInfo: {
                name: service.name,
                description: service.description,
                pricePerPerson: service.pricePerPerson,
                timeOfServiceInMinutes: service.timeOfServiceInMinutes
              }
            };
          }
        }
        return event;
      });

      return eventsWithServices;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get public schedule for a specific user - only date and time information
   * @param userId - User ID to get schedule for
   * @returns Promise with user's event dates and times only
   */
  async getPublicUserSchedule(userId: string): Promise<{ eventDate: Date; eventTime: string }[]> {
    try {
      const userObjectId = new Types.ObjectId(userId);

      const schedule = await this.eventModel
        .find({
          userId: userObjectId,
          eventStatus: 'active' // Only return active events
        })
        .select('eventDate eventTime') // Only select date and time fields
        .sort({ eventDate: 1, eventTime: 1 }) // Sort by date and time ascending
        .lean()
        .exec();

      return schedule;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Extract .ics file URLs from PROPFIND response
   */
  private extractIcsFilesFromResponse(responseText: string, baseCalendarUrl: string): string[] {
    const icsFiles: string[] = [];

    try {
      // Look for href elements containing .ics files
      const hrefMatches = responseText.match(/<d:href>([^<]*\.ics[^<]*)<\/d:href>/gi);

      if (hrefMatches) {
        for (const match of hrefMatches) {
          const href = match.replace(/<\/?d:href>/gi, '').trim();

          // Convert relative URLs to absolute URLs
          let fullUrl = href;
          if (href.startsWith('/')) {
            // Relative URL - construct full URL
            const baseUrl = new URL(baseCalendarUrl);
            fullUrl = `${baseUrl.protocol}//${baseUrl.host}${href}`;
          } else if (!href.startsWith('http')) {
            // Relative path within calendar
            fullUrl = baseCalendarUrl + (baseCalendarUrl.endsWith('/') ? '' : '/') + href;
          }

          icsFiles.push(fullUrl);
        }
      }
    } catch (error) {
      this.logger.warn('Error extracting .ics files:', error);
    }

    return icsFiles;
  }

  /**
   * Extract basic event information from .ics content
   */
  private extractBasicEventInfo(icsContent: string): any {
    try {
      const eventInfo: any = {};

      // Extract SUMMARY (event title)
      const summaryMatch = icsContent.match(/SUMMARY:(.*?)(?:\r?\n)/);
      if (summaryMatch) {
        eventInfo.title = summaryMatch[1].trim();
      }

      // Extract DTSTART (start date/time) with timezone information
      const dtstartMatch = icsContent.match(/DTSTART[^:]*:(.*?)(?:\r?\n)/);
      if (dtstartMatch) {
        const fullDtstart = dtstartMatch[0]; // Full DTSTART line including parameters
        eventInfo.startTime = dtstartMatch[1].trim();

        // Check if timezone is specified in DTSTART parameters
        const tzidMatch = fullDtstart.match(/TZID=([^:;]+)/);
        const isUtc = dtstartMatch[1].trim().endsWith('Z') || fullDtstart.includes('TZID=UTC');

        // Debug logging for timezone detection
        this.logger.log(`🔍 Timezone detection for event:`);
        this.logger.log(`   📄 Full DTSTART: ${fullDtstart}`);
        // this.logger.log(`   📅 Date value: ${dateStr}`);
        this.logger.log(`   🌍 TZID match: ${tzidMatch ? tzidMatch[1] : 'none'}`);
        this.logger.log(`   🕰️  Is UTC: ${isUtc}`);

        // Try to parse the date
        try {
          const dateStr = dtstartMatch[1].trim();
          if (dateStr.length === 8) {
            // YYYYMMDD format (all day event)
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(4, 6);
            const day = dateStr.substring(6, 8);
            eventInfo.startDate = `${year}-${month}-${day}`;
            eventInfo.isAllDay = true;
          } else if (dateStr.includes('T')) {
            // YYYYMMDDTHHMMSS format or YYYYMMDDTHHMMSSZ
            const datePart = dateStr.split('T')[0];
            const timePart = dateStr.split('T')[1].replace(/[Z]/g, '');

            const year = datePart.substring(0, 4);
            const month = datePart.substring(4, 6);
            const day = datePart.substring(6, 8);

            const hour = timePart.substring(0, 2);
            const minute = timePart.substring(2, 4);

            eventInfo.startDate = `${year}-${month}-${day}`;
            eventInfo.startTimeFormatted = `${hour}:${minute}`;
            eventInfo.isAllDay = false;

            // Handle timezone conversion for Orange calendar events
            // Orange (French telecom) typically stores events in Europe/Paris timezone
            if (isUtc) {
              // Only convert if explicitly marked as UTC (has 'Z' suffix or TZID=UTC)
              const convertedTime = this.convertUtcToParisTime(year, month, day, hour, minute);

              eventInfo.startDateLocal = convertedTime.date;
              eventInfo.startTimeLocal = convertedTime.time;
              eventInfo.timezone = 'UTC_converted_to_Europe/Paris';

              // Override the formatted time to use converted time
              eventInfo.startTimeFormatted = eventInfo.startTimeLocal;
              eventInfo.startDate = eventInfo.startDateLocal;

              this.logger.log(`🕐 Converted UTC time ${hour}:${minute} to Paris time ${convertedTime.time} (Date: ${convertedTime.date})`);
            } else if (tzidMatch) {
              // Handle explicit timezone (e.g., Europe/Paris)
              eventInfo.timezone = tzidMatch[1];
              this.logger.log(`🌍 Event timezone detected: ${tzidMatch[1]}`);
              // If already in Paris timezone or local, use as-is
              eventInfo.startTimeLocal = eventInfo.startTimeFormatted;
              eventInfo.startDateLocal = eventInfo.startDate;
            } else {
              // No timezone specified - Orange calendar quirk needs +5 hour adjustment
              // Based on user feedback: 13:00 from Orange should display as 18:00
              this.logger.log(`🍊 Orange event without explicit timezone, applying +5h adjustment`);

              const hourNum = parseInt(hour);
              const minuteNum = parseInt(minute);

              // Add 5 hours to match expected behavior (13:00 → 18:00)
              let adjustedHour = hourNum + 5;
              let adjustedDate = eventInfo.startDate;

              // Handle day overflow
              if (adjustedHour >= 24) {
                adjustedHour = adjustedHour - 24;
                // Add one day to the date
                const currentDate = new Date(eventInfo.startDate);
                currentDate.setDate(currentDate.getDate() + 1);
                adjustedDate = currentDate.toISOString().split('T')[0];
              }

              const adjustedTime = `${adjustedHour.toString().padStart(2, '0')}:${minute}`;

              eventInfo.startTimeFormatted = adjustedTime;
              eventInfo.startTimeLocal = adjustedTime;
              eventInfo.startDateLocal = adjustedDate;
              eventInfo.timezone = 'Orange_calendar_adjusted_+5h';

              this.logger.log(`🕐 Orange calendar time adjustment: ${hour}:${minute} → ${adjustedTime} (+5 hours)`);
            }
          }
        } catch (parseError) {
          this.logger.warn('Error parsing date:', parseError);
        }
      }

      // Extract DTEND (end date/time)
      const dtendMatch = icsContent.match(/DTEND[^:]*:(.*?)(?:\r?\n)/);
      if (dtendMatch) {
        eventInfo.endTime = dtendMatch[1].trim();
      }

      // Extract DESCRIPTION
      const descMatch = icsContent.match(/DESCRIPTION:(.*?)(?:\r?\n)/);
      if (descMatch) {
        eventInfo.description = descMatch[1].trim();
      }

      // Extract UID
      const uidMatch = icsContent.match(/UID:(.*?)(?:\r?\n)/);
      if (uidMatch) {
        eventInfo.uid = uidMatch[1].trim();
      }

      return eventInfo;

    } catch (error) {
      this.logger.warn('Error parsing event info:', error);
      return null;
    }
  }

  /**
   * Sync events from all calendar connectors to the events table
   * @returns Promise with sync results
   */
  async syncEventsFromConnectors(): Promise<{
    success: boolean;
    message: string;
    data: {
      totalProcessed: number;
      syncResults: any[];
    };
  }> {
    try {
      this.logger.log('🔄 Starting calendar sync process...');

      // Get all active connectors
      const connectors = await this.connectorModel.find().exec();

      if (!connectors || connectors.length === 0) {
        return {
          success: true,
          message: 'No calendar connectors found to sync',
          data: {
            totalProcessed: 0,
            syncResults: []
          }
        };
      }

      this.logger.log(`📊 Found ${connectors.length} connector(s) to process`);

      const syncResults: any[] = [];
      let totalProcessed = 0;

      for (const connector of connectors) {
        try {
          this.logger.log(`🔗 Processing connector: ${connector.connector_name} for user: ${connector.userId}`);

          let result;
          switch (connector.connector_name) {
            case 'orange':
              if (connector.connector_creds?.orange?.isActive && connector.connector_creds?.orange?.isValid) {
                result = await this.syncOrangeCalendarEvents(connector);
                totalProcessed++;
              } else {
                this.logger.warn(`⚠️ Orange connector inactive/invalid for user: ${connector.userId}`);
                result = {
                  connectorType: 'orange',
                  userId: connector.userId.toString(),
                  status: 'skipped',
                  message: 'Connector inactive or invalid'
                };
              }
              break;

            case 'ovh':
              this.logger.log(`🔧 OVH connector found for user ${connector.userId} - Not implemented yet`);
              result = {
                connectorType: 'ovh',
                userId: connector.userId.toString(),
                status: 'not_implemented',
                message: 'OVH connector sync not implemented yet'
              };
              break;

            case 'microsoft':
              this.logger.log(`🔧 Microsoft connector found for user ${connector.userId} - Not implemented yet`);
              result = {
                connectorType: 'microsoft',
                userId: connector.userId.toString(),
                status: 'not_implemented',
                message: 'Microsoft connector sync not implemented yet'
              };
              break;

            default:
              this.logger.warn(`❓ Unknown connector type: ${connector.connector_name}`);
              result = {
                connectorType: connector.connector_name,
                userId: connector.userId.toString(),
                status: 'unknown',
                message: 'Unknown connector type'
              };
          }

          syncResults.push(result);

        } catch (connectorError) {
          this.logger.error(`❌ Error processing connector ${connector.connector_name}:`, connectorError);
          syncResults.push({
            connectorType: connector.connector_name,
            userId: connector.userId.toString(),
            status: 'error',
            message: connectorError.message || 'Unknown error occurred'
          });
        }
      }

      this.logger.log(`✅ Sync process completed. Processed ${totalProcessed} active connectors`);

      return {
        success: true,
        message: `Calendar sync completed. Processed ${totalProcessed} active connectors.`,
        data: {
          totalProcessed,
          syncResults
        }
      };

    } catch (error) {
      this.logger.error('❌ Calendar sync error:', error);
      throw new InternalServerErrorException('Failed to sync calendar events');
    }
  }

  /**
   * Sync events from Orange Mail calendar
   */
  private async syncOrangeCalendarEvents(connector: any): Promise<any> {
    try {
      this.logger.log(`🍊 Starting Orange calendar sync for user: ${connector.userId}`);

      const orangeCreds = connector.connector_creds.orange;
      if (!orangeCreds?.username || !orangeCreds?.password) {
        throw new Error('Missing Orange credentials');
      }

      // Decrypt the password
      const decryptedPassword = EncryptionService.decrypt(orangeCreds.password);

      // Get calendar with caching and retry logic
      const calendar = await this.getOrangeCalendar(orangeCreds.username, decryptedPassword);

      const listResponse = await fetch(calendar.url, {
        method: 'PROPFIND',
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Authorization': `Basic ${Buffer.from(`${orangeCreds.username}:${decryptedPassword}`).toString('base64')}`,
          'Depth': '1'
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
        <D:propfind xmlns:D="DAV:">
            <D:prop>
                <D:href/>
                <D:resourcetype/>
                <D:displayname/>
            </D:prop>
        </D:propfind>`
      });

      if (!listResponse.ok) {
        throw new Error(`PROPFIND failed: ${listResponse.status} ${listResponse.statusText}`);
      }

      const responseText = await listResponse.text();
      const icsFiles = this.extractIcsFilesFromResponse(responseText, calendar.url);

      if (icsFiles.length === 0) {
        this.logger.log(`📭 No .ics files found in Orange calendar for user: ${connector.userId}`);
        return {
          connectorType: 'orange',
          userId: connector.userId.toString(),
          status: 'success',
          message: 'No events found to sync',
          eventsSynced: 0
        };
      }

      // Fetch and parse all events
      const events: any[] = [];
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1; // JavaScript months are 0-based
      const currentYear = currentDate.getFullYear();

      for (const icsUrl of icsFiles) {
        try {
          const icsResponse = await fetch(icsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Basic ${Buffer.from(`${orangeCreds.username}:${decryptedPassword}`).toString('base64')}`,
              'Content-Type': 'text/calendar',
              'User-Agent': 'CalDAV-Client/1.0'
            }
          });

          if (icsResponse.ok) {
            const icsContent = await icsResponse.text();
            if (icsContent.includes('VEVENT')) {
              const eventInfo = this.extractBasicEventInfo(icsContent);
              if (eventInfo && eventInfo.startDate) {
                // Filter for current month events
                const eventDate = new Date(eventInfo.startDate);
                if (eventDate.getMonth() + 1 === currentMonth && eventDate.getFullYear() === currentYear) {
                  events.push(eventInfo);
                }
              }
            }
          }
        } catch (fetchError) {
          this.logger.warn(`⚠️ Error fetching .ics file: ${fetchError.message}`);
        }
      }

      if (events.length === 0) {
        return {
          connectorType: 'orange',
          userId: connector.userId.toString(),
          status: 'success',
          message: 'No current month events found to sync',
          eventsSynced: 0
        };
      }

      // Save events to database with conflict prevention
      const syncedEvents = await this.saveEventsToDatabase(events, connector.userId, 'orange');

      this.logger.log(`✅ Successfully synced ${syncedEvents} events from Orange calendar`);

      return {
        connectorType: 'orange',
        userId: connector.userId.toString(),
        status: 'success',
        message: `Successfully synced ${syncedEvents} events`,
        eventsSynced: syncedEvents,
        eventsData: events
      };

    } catch (error) {
      this.logger.error(`❌ Orange calendar sync error for user ${connector.userId}:`, error);
      throw error;
    }
  }

  /**
   * Save events to database with duplicate prevention
   */
  private async saveEventsToDatabase(events: any[], userId: any, source: string): Promise<number> {
    try {
      let savedCount = 0;

      for (const eventInfo of events) {
        try {
          // Check if event already exists by external event ID (UID)
          const existingExternalEvent = await this.eventModel
            .findOne({
              userId: userId,
              externalEventId: eventInfo.uid,
              externalCalendarSource: source
            })
            .exec();

          if (existingExternalEvent) {
            this.logger.log(`⏭️ External event ${eventInfo.title} already exists, skipping...`);
            continue;
          }

          // Also check if there's a booking event for the same date to avoid duplicates
          // Use a broader check since times might differ due to timezone adjustments
          const existingBookingEvent = await this.eventModel
            .findOne({
              userId: userId,
              eventType: 'booking',
              eventDate: new Date(eventInfo.startDate),
              eventStatus: 'active',
              // Check if the event names are similar (booking vs Orange sync)
              $or: [
                { eventName: { $regex: eventInfo.title?.replace('Réservation:', 'Booking:'), $options: 'i' } },
                { eventName: { $regex: eventInfo.title?.replace('Booking:', 'Réservation:'), $options: 'i' } }
              ]
            })
            .exec();

          if (existingBookingEvent) {
            this.logger.log(`⚠️ Found existing booking event for same date with similar name, skipping external event: ${eventInfo.title}`);
            this.logger.log(`   📅 Existing: ${existingBookingEvent.eventName} at ${existingBookingEvent.eventTime}`);
            this.logger.log(`   🆕 New: ${eventInfo.title} at ${eventInfo.startTimeFormatted}`);
            continue;
          }

          // Debug logging for timezone issues
          this.logger.log(`🔍 Saving event from ${source}:`);
          this.logger.log(`   📅 Original startTime: ${eventInfo.startTime}`);
          this.logger.log(`   🕐 Formatted startTime: ${eventInfo.startTimeFormatted}`);
          this.logger.log(`   🌍 Timezone: ${eventInfo.timezone}`);
          this.logger.log(`   📍 StartTimeLocal: ${eventInfo.startTimeLocal}`);

          // Create new event document
          const newEvent = new this.eventModel({
            userId: userId,
            eventName: eventInfo.title || 'Untitled Event',
            eventDate: new Date(eventInfo.startDate),
            eventTime: this.addHoursToTimeString(eventInfo.startTimeFormatted, 3) || '00:00',
            eventDescription: eventInfo.description || '',
            eventType: 'external',
            externalCalendarSource: source,
            externalEventId: eventInfo.uid,
            eventStatus: 'active',
            isAllDay: eventInfo.isAllDay || false
          });

          await newEvent.save();
          savedCount++;

          this.logger.log(`✅ Saved event: ${eventInfo.title} on ${eventInfo.startDate} at ${eventInfo.startTimeFormatted}`);

        } catch (saveError) {
          this.logger.error(`❌ Error saving event ${eventInfo.title}:`, saveError);
        }
      }

      return savedCount;
    } catch (error) {
      this.logger.error('❌ Error in saveEventsToDatabase:', error);
      throw error;
    }
  }

  /**
   * Get or discover Orange calendar with caching and retry logic
   */
  private async getOrangeCalendar(username: string, password: string, retryCount = 0): Promise<any> {
    const cacheKey = `orange-${username}`;
    const cached = this.calendarCache.get(cacheKey);

    // Check if we have a valid cached calendar
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      this.logger.log('📅 Using cached calendar');
      return cached.calendar;
    }

    try {
      this.logger.log('🔍 Discovering calendars...');

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

      this.logger.log(`📅 Calendar discovered and cached: ${calendar.displayName || 'Default Calendar'}`);
      return calendar;

    } catch (error) {
      this.logger.error('Error discovering calendar:', error);

      // Retry logic for network issues
      if (retryCount < 2 && (error.message.includes('Bad status') || error.message.includes('network'))) {
        this.logger.log(`🔄 Retrying calendar discovery (attempt ${retryCount + 1}/3)...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Exponential backoff
        return this.getOrangeCalendar(username, password, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Convert UTC time to Paris timezone
   */
  private convertUtcToParisTime(year: string, month: string, day: string, hour: string, minute: string): { date: string; time: string } {
    try {
      // Create UTC date from the components
      const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);

      // Convert to Paris timezone using Intl.DateTimeFormat for more reliable conversion
      const parisFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Paris',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const parts = parisFormatter.formatToParts(utcDate);
      const partsMap = parts.reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
      }, {} as any);

      const result = {
        date: `${partsMap.year}-${partsMap.month}-${partsMap.day}`,
        time: `${partsMap.hour}:${partsMap.minute}`
      };

      return result;
    } catch (error) {
      this.logger.warn(`Error converting UTC to Paris time: ${error.message}`);
      // Fallback to original time if conversion needs
      return {
        date: `${year}-${month}-${day}`,
        time: `${hour}:${minute}`
      };
    }
  }

  /**
   * Check if event is all-day based on time information
   */
  private isAllDayEvent(event: any): boolean {
    // If no specific time is set, or if it's a date-only event, consider it all-day
    if (!event.startDate || !event.endDate) return false;

    const start = new Date(event.startDate);
    const end = new Date(event.endDate);

    // If start and end are on same day at 00:00, it's likely all-day
    return (
      start.getHours() === 0 &&
      start.getMinutes() === 0 &&
      end.getHours() === 0 &&
      end.getMinutes() === 0 &&
      start.toDateString() === end.toDateString()
    );
  }

  private addHoursToTimeString(timeStr: string, hoursToAdd: number): string {
    if (!timeStr || !timeStr.includes(':')) return '00:00';

    const [hours, minutes] = timeStr.split(':');
    const currentHour = parseInt(hours);
    const newHour = (currentHour + hoursToAdd) % 24;

    return `${newHour.toString().padStart(2, '0')}:${minutes}`;
  }

  /*
   @desc - run cron job to sync events every 6 hours
  */
  @Cron(CronExpression.EVERY_6_HOURS)
  handleCron() {
    this.logger.log('🕒 Cron job triggered: Syncing calendar events...');
    this.syncEventsFromConnectors()
      .then(result => {
        this.logger.log(`🕒 Cron job completed: ${result.message}`);
      })
      .catch(error => {
        this.logger.error('❌ Cron job error during calendar sync:', error);
      });
  }
}
