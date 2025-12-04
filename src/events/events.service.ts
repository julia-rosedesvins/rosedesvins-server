import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event } from '../schemas/events.schema';
import { Connector } from '../schemas/connector.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { EncryptionService } from '../common/encryption.service';
import { Buffer } from 'buffer';
import { Cron, CronExpression } from '@nestjs/schedule';
import axios from 'axios';
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
  async getPublicUserSchedule(userId: string): Promise<{ eventDate: Date; eventTime: string; eventEndTime?: string; eventType?: string; totalParticipants?: number }[]> {
    try {
      const userObjectId = new Types.ObjectId(userId);

      const schedule = await this.eventModel
        .find({
          userId: userObjectId,
          eventStatus: 'active' // Only return active events
        })
        .select('eventDate eventTime eventEndTime eventType bookingId') // Include eventType to differentiate external events
        .populate({
          path: 'bookingId',
          select: 'participantsAdults participantsEnfants' // Get participant counts from booking
        })
        .sort({ eventDate: 1, eventTime: 1 }) // Sort by date and time ascending
        .lean()
        .exec();

      // Transform the data to include total participants and event type
      return schedule.map(event => {
        let totalParticipants: number | undefined = undefined;

        // If this event has a booking, calculate total participants
        if (event.bookingId && typeof event.bookingId === 'object') {
          const booking = event.bookingId as any;
          const adults = booking.participantsAdults || 0;
          const children = booking.participantsEnfants || 0;
          totalParticipants = adults + children;
        }

        return {
          eventDate: event.eventDate,
          eventTime: event.eventTime,
          eventEndTime: event.eventEndTime,
          eventType: event.eventType, // Include eventType to differentiate external events
          totalParticipants
        };
      });
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

        // Parse end time similar to start time
        try {
          const endDateStr = dtendMatch[1].trim();
          if (endDateStr.includes('T') && !eventInfo.isAllDay) {
            const endTimePart = endDateStr.split('T')[1].replace(/[Z]/g, '');
            const endHour = endTimePart.substring(0, 2);
            const endMinute = endTimePart.substring(2, 4);

            eventInfo.endTimeFormatted = `${endHour}:${endMinute}`;

            // Apply same timezone adjustments as start time
            if (eventInfo.timezone === 'Orange_calendar_adjusted_+5h') {
              const endHourNum = parseInt(endHour);
              let adjustedEndHour = endHourNum + 5;

              // Handle day overflow
              if (adjustedEndHour >= 24) {
                adjustedEndHour = adjustedEndHour - 24;
              }

              eventInfo.endTimeFormatted = `${adjustedEndHour.toString().padStart(2, '0')}:${endMinute}`;
              this.logger.log(`🕐 Orange calendar end time adjustment: ${endHour}:${endMinute} → ${eventInfo.endTimeFormatted} (+5 hours)`);
            }
          } else if (eventInfo.isAllDay) {
            eventInfo.endTimeFormatted = '23:59'; // All-day events end at end of day
          }
        } catch (parseError) {
          this.logger.warn('Error parsing end time:', parseError);
        }
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
              if (connector.connector_creds?.microsoft?.isActive && connector.connector_creds?.microsoft?.isValid) {
                result = await this.syncMicrosoftCalendarEvents(connector);
                totalProcessed++;
              } else {
                this.logger.warn(`⚠️ Microsoft connector inactive/invalid for user: ${connector.userId}`);
                result = {
                  connectorType: 'microsoft',
                  userId: connector.userId.toString(),
                  status: 'skipped',
                  message: 'Connector inactive or invalid'
                };
              }
              break;

            case 'google':
              if (connector.connector_creds?.google?.isActive && connector.connector_creds?.google?.isValid) {
                result = await this.syncGoogleCalendarEvents(connector);
                totalProcessed++;
              } else {
                this.logger.warn(`⚠️ Google connector inactive/invalid for user: ${connector.userId}`);
                result = {
                  connectorType: 'google',
                  userId: connector.userId.toString(),
                  status: 'skipped',
                  message: 'Connector inactive or invalid'
                };
              }
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

      // Calculate next 2 months (handle year rollover)
      const nextMonth = currentDate.getMonth() + 2; // +2 because getMonth() is 0-based, and we want next month
      const nextMonthYear = nextMonth > 12 ? currentYear + 1 : currentYear;
      const adjustedNextMonth = nextMonth > 12 ? nextMonth - 12 : nextMonth;

      const monthAfterNext = currentDate.getMonth() + 3; // +3 for the third month
      const monthAfterNextYear = monthAfterNext > 12 ? currentYear + 1 : currentYear;
      const adjustedMonthAfterNext = monthAfterNext > 12 ? monthAfterNext - 12 : monthAfterNext;

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
                // Filter for current month + next 2 months (3 months total)
                const eventDate = new Date(eventInfo.startDate);
                const eventMonth = eventDate.getMonth() + 1;
                const eventYear = eventDate.getFullYear();

                const isCurrentMonth = (eventMonth === currentMonth && eventYear === currentYear);
                const isNextMonth = (eventMonth === adjustedNextMonth && eventYear === nextMonthYear);
                const isMonthAfterNext = (eventMonth === adjustedMonthAfterNext && eventYear === monthAfterNextYear);

                if (isCurrentMonth || isNextMonth || isMonthAfterNext) {
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
          message: 'No events found to sync (current + next 2 months)',
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
   * Sync events from Google Calendar
   */
  private async syncGoogleCalendarEvents(connector: any): Promise<any> {
    try {
      this.logger.log(`🔵 Starting Google Calendar sync for user: ${connector.userId}`);

      const googleCreds = connector.connector_creds.google;
      if (!googleCreds?.accessToken || !googleCreds?.refreshToken) {
        throw new Error('Missing Google credentials');
      }

      // Check if token needs refresh (5 minute buffer)
      const now = new Date();
      const expiresAt = new Date(googleCreds.expiresAt);
      const bufferTime = 5 * 60 * 1000; // 5 minutes

      let accessToken = googleCreds.accessToken;

      if (now.getTime() > (expiresAt.getTime() - bufferTime)) {
        this.logger.log('🔄 Google token expired, refreshing...');

        // Refresh token logic
        const refreshed = await this.refreshGoogleTokenForSync(connector);
        if (!refreshed) {
          throw new Error('Failed to refresh Google access token');
        }
        accessToken = refreshed;
      }

      // Get current month + next 2 months date range (3 months total)
      const currentDate = new Date();
      const firstDayOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDayOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0, 23, 59, 59);

      // Fetch events from Google Calendar API (Paris window converted to ISO)
      const timeMin = firstDayOfCurrentMonth.toISOString();
      const timeMax = lastDayOfNextMonth.toISOString();

      this.logger.log(`📅 Fetching Google Calendar events (current + next 2 months):`);
      this.logger.log(`   📆 Date Range: ${firstDayOfCurrentMonth.toLocaleDateString('fr-FR')} to ${lastDayOfNextMonth.toLocaleDateString('fr-FR')}`);
      this.logger.log(`   🌐 ISO Range: ${timeMin} to ${timeMax}`);

      // Fetch all Google events with pagination to avoid missing events
      const googleEvents = await this.fetchAllGoogleEvents(accessToken, timeMin, timeMax);

      if (googleEvents.length === 0) {
        this.logger.log(`📭 No events found in Google Calendar for user: ${connector.userId}`);
        return {
          connectorType: 'google',
          userId: connector.userId.toString(),
          status: 'success',
          message: 'No events found to sync (current + next 2 months)',
          eventsSynced: 0
        };
      }

      this.logger.log(`📊 Found ${googleEvents.length} raw event(s) in Google Calendar`);

      // Parse Google Calendar events to our format
      const events: any[] = [];
      for (const gEvent of googleEvents) {
        try {
          const parsedEvents = this.parseGoogleCalendarEvent(gEvent);
          if (parsedEvents) {
            // parseGoogleCalendarEvent now returns an array of events (for multi-day support)
            const eventsArray = Array.isArray(parsedEvents) ? parsedEvents : [parsedEvents];
            for (const eventInfo of eventsArray) {
              events.push(eventInfo);
              this.logger.log(`✅ Parsed: ${eventInfo.title} on ${eventInfo.startDate} at ${eventInfo.startTimeFormatted}`);
            }
          }
        } catch (parseError) {
          this.logger.warn(`⚠️ Error parsing Google event: ${parseError.message}`);
        }
      }

      this.logger.log(`📋 Successfully parsed ${events.length} out of ${googleEvents.length} events`);

      if (events.length === 0) {
        return {
          connectorType: 'google',
          userId: connector.userId.toString(),
          status: 'success',
          message: 'No valid events found to sync (current + next 2 months)',
          eventsSynced: 0
        };
      }

      // Save events to database with conflict prevention
      const syncedEvents = await this.saveEventsToDatabase(events, connector.userId, 'google');

      this.logger.log(`✅ Successfully synced ${syncedEvents} events from Google Calendar`);

      return {
        connectorType: 'google',
        userId: connector.userId.toString(),
        status: 'success',
        message: `Successfully synced ${syncedEvents} events`,
        eventsSynced: syncedEvents,
        eventsData: events
      };

    } catch (error) {
      this.logger.error(`❌ Google Calendar sync error for user ${connector.userId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch all Google events with pagination (handles nextPageToken)
   */
  private async fetchAllGoogleEvents(
    accessToken: string,
    timeMin: string,
    timeMax: string
  ): Promise<any[]> {
    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events`;
    let pageToken: string | undefined = undefined;
    const allEvents: any[] = [];

    do {
      const response = await axios.get(eventsUrl, {
        params: {
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500,
          pageToken
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        },
        timeout: 15000,
        family: 4,
        proxy: false
      });

      const data = response.data || {};
      if (Array.isArray(data.items) && data.items.length) {
        allEvents.push(...data.items);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    this.logger.log(`🔵 Google pagination gathered ${allEvents.length} event(s)`);
    return allEvents;
  }

  /**
   * Parse Google Calendar event to our event format
   */
  private parseGoogleCalendarEvent(gEvent: any): any[] | null {
    try {
      const eventInfo: any = {};

      // Extract event title
      eventInfo.title = gEvent.summary || 'Untitled Event';

      // Extract event ID (base ID for multi-day events)
      eventInfo.uid = gEvent.id;

      // Extract description
      eventInfo.description = gEvent.description || '';

      // Extract start time and date
      const start = gEvent.start?.dateTime || gEvent.start?.date;
      const end = gEvent.end?.dateTime || gEvent.end?.date;

      if (!start) {
        this.logger.warn('⚠️ Google event missing start time');
        return null;
      }

      // Check if all-day event
      eventInfo.isAllDay = !!gEvent.start?.date; // If 'date' is used instead of 'dateTime', it's all-day

      if (eventInfo.isAllDay) {
        // All-day event - check if it spans multiple days
        const startDate = new Date(start);
        const endDate = new Date(end);
        
        // Calculate number of days (Google Calendar end date is exclusive for all-day events)
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
          // Multi-day event - create separate events for each day
          this.logger.log(`📅 Multi-day event detected: ${eventInfo.title} spans ${daysDiff} days`);
          const events: any[] = [];
          
          for (let i = 0; i < daysDiff; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const dayEvent = {
              ...eventInfo,
              uid: `${eventInfo.uid}_day${i + 1}`, // Unique ID for each day
              startDate: currentDate.toISOString().split('T')[0],
              startTimeFormatted: '00:00',
              endTimeFormatted: '23:59',
              isAllDay: true
            };
            
            events.push(dayEvent);
          }
          
          return events;
        } else {
          // Single day all-day event
          eventInfo.startDate = startDate.toISOString().split('T')[0];
          eventInfo.startTimeFormatted = '00:00';
          eventInfo.endTimeFormatted = '23:59';
        }
      } else {
        // Timed event - parse datetime
        const startDate = new Date(start);
        const endDate = new Date(end);

        // Convert to Paris timezone
        const parisFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/Paris',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const startParts = parisFormatter.formatToParts(startDate);
        const startPartsMap = startParts.reduce((acc, part) => {
          acc[part.type] = part.value;
          return acc;
        }, {} as any);

        const endParts = parisFormatter.formatToParts(endDate);
        const endPartsMap = endParts.reduce((acc, part) => {
          acc[part.type] = part.value;
          return acc;
        }, {} as any);

        eventInfo.startDate = `${startPartsMap.year}-${startPartsMap.month}-${startPartsMap.day}`;
        eventInfo.startTimeFormatted = `${startPartsMap.hour}:${startPartsMap.minute}`;
        eventInfo.endTimeFormatted = `${endPartsMap.hour}:${endPartsMap.minute}`;
        eventInfo.startTimeLocal = eventInfo.startTimeFormatted;
        eventInfo.startDateLocal = eventInfo.startDate;
        eventInfo.timezone = 'Europe/Paris';
      }

      // Log parsed event
      this.logger.log(`📋 Parsed Google event: ${eventInfo.title} on ${eventInfo.startDate} at ${eventInfo.startTimeFormatted} - ${eventInfo.endTimeFormatted}`);

      return [eventInfo]; // Return array for consistency

    } catch (error) {
      this.logger.warn('⚠️ Error parsing Google Calendar event:', error);
      return null;
    }
  }

  /**
   * Refresh Google token specifically for sync operations
   */
  private async refreshGoogleTokenForSync(connector: any): Promise<string | null> {
    try {
      const googleCreds = connector.connector_creds.google;

      if (!googleCreds?.refreshToken) {
        throw new Error('Missing Google refresh token');
      }

      // Note: We need ConfigService injected for this
      // For now, use environment variables directly or pass from the main service
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error('Google OAuth credentials are not configured');
      }

      const refreshToken = googleCreds.refreshToken;

      // Exchange refresh token for new access token
      const tokenUrl = 'https://oauth2.googleapis.com/token';

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      // Use axios instead of fetch for better network compatibility
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000, // 10 second timeout
        family: 4,
        proxy: false
      });

      const tokenData = response.data;

      if (!tokenData || !tokenData.access_token) {
        this.logger.error('❌ Google token refresh failed: Invalid response', tokenData);
        // Mark connector as invalid
        connector.connector_creds.google.isValid = false;
        await connector.save();
        return null;
      }

      // Update access token in database
      const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

      connector.connector_creds.google.accessToken = tokenData.access_token;
      connector.connector_creds.google.expiresIn = tokenData.expires_in;
      connector.connector_creds.google.expiresAt = newExpiresAt;
      connector.connector_creds.google.isValid = true;

      // Keep existing refresh token if not provided
      if (tokenData.refresh_token) {
        connector.connector_creds.google.refreshToken = tokenData.refresh_token;
      }

      await connector.save();

      this.logger.log('✅ Google token refreshed successfully for sync');
      return tokenData.access_token;

    } catch (error) {
      this.logger.error('❌ Error refreshing Google token for sync:', error);

      // Mark connector as invalid if authentication failed
      if (error.response?.status === 401 || error.response?.status === 400) {
        try {
          connector.connector_creds.google.isValid = false;
          await connector.save();
          this.logger.warn('⚠️ Marked Google connector as invalid due to auth failure');
        } catch (saveError) {
          this.logger.error('❌ Failed to mark connector as invalid:', saveError);
        }
      }

      return null;
    }
  }

  /**
   * Sync events from Microsoft Calendar
   */
  private async syncMicrosoftCalendarEvents(connector: any): Promise<any> {
    try {
      this.logger.log(`🟦 Starting Microsoft Calendar sync for user: ${connector.userId}`);

      const microsoftCreds = connector.connector_creds.microsoft;
      if (!microsoftCreds?.accessToken || !microsoftCreds?.refreshToken) {
        throw new Error('Missing Microsoft credentials');
      }

      // Check if token needs refresh (5 minute buffer)
      const now = new Date();
      const expiresAt = new Date(microsoftCreds.expiresAt);
      const bufferTime = 5 * 60 * 1000; // 5 minutes

      let accessToken = microsoftCreds.accessToken;

      if (now.getTime() > (expiresAt.getTime() - bufferTime)) {
        this.logger.log('🔄 Microsoft token expired, refreshing...');

        // Refresh token logic
        const refreshed = await this.refreshMicrosoftTokenForSync(connector);
        if (!refreshed) {
          throw new Error('Failed to refresh Microsoft access token');
        }
        accessToken = refreshed;
      }

      // Get current month + next 2 months date range (3 months total)
      const currentDate = new Date();
      const firstDayOfCurrentMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const lastDayOfNextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0, 23, 59, 59);

      // Build Paris-local window strings for Microsoft Graph (no timezone suffix)
      const startDateTime = this.formatDateTimeForTimezone(firstDayOfCurrentMonth, 'Europe/Paris', '00:00:00');
      const endDateTime = this.formatDateTimeForTimezone(lastDayOfNextMonth, 'Europe/Paris', '23:59:59');

      this.logger.log(`📅 Fetching Microsoft Calendar events from ${startDateTime} to ${endDateTime} (current + next 2 months)`);

      // Fetch all Microsoft events with pagination (@odata.nextLink)
      const microsoftEvents = await this.fetchAllMicrosoftEvents(accessToken, startDateTime, endDateTime);

      if (microsoftEvents.length === 0) {
        this.logger.log(`📭 No events found in Microsoft Calendar for user: ${connector.userId}`);
        return {
          connectorType: 'microsoft',
          userId: connector.userId.toString(),
          status: 'success',
          message: 'No events found to sync (current + next 2 months)',
          eventsSynced: 0
        };
      }

      this.logger.log(`📊 Found ${microsoftEvents.length} event(s) in Microsoft Calendar`);

      // Parse Microsoft Calendar events to our format
      const events: any[] = [];
      for (const msEvent of microsoftEvents) {
        try {
          const parsedEvents = this.parseMicrosoftCalendarEvent(msEvent);
          if (parsedEvents) {
            // parseMicrosoftCalendarEvent now returns an array of events (for multi-day support)
            const eventsArray = Array.isArray(parsedEvents) ? parsedEvents : [parsedEvents];
            events.push(...eventsArray);
          }
        } catch (parseError) {
          this.logger.warn(`⚠️ Error parsing Microsoft event: ${parseError.message}`);
        }
      }

      if (events.length === 0) {
        return {
          connectorType: 'microsoft',
          userId: connector.userId.toString(),
          status: 'success',
          message: 'No valid events found to sync (current + next 2 months)',
          eventsSynced: 0
        };
      }

      // Save events to database with conflict prevention
      const syncedEvents = await this.saveEventsToDatabase(events, connector.userId, 'microsoft');

      this.logger.log(`✅ Successfully synced ${syncedEvents} events from Microsoft Calendar`);

      return {
        connectorType: 'microsoft',
        userId: connector.userId.toString(),
        status: 'success',
        message: `Successfully synced ${syncedEvents} events`,
        eventsSynced: syncedEvents,
        eventsData: events
      };

    } catch (error) {
      this.logger.error(`❌ Microsoft Calendar sync error for user ${connector.userId}:`, error);
      throw error;
    }
  }

  /**
   * Format date/time for a specific timezone as YYYY-MM-DDTHH:mm:ss (no timezone suffix)
   * Useful for Microsoft Graph calendarView when using Prefer: outlook.timezone
   */
  private formatDateTimeForTimezone(date: Date, timezone: string, time: string): string {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(date);
      const map = parts.reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {} as any);
      return `${map.year}-${map.month}-${map.day}T${time}`;
    } catch {
      // Fallback to ISO date components if formatter fails
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}T${time}`;
    }
  }

  /**
   * Fetch all Microsoft events with pagination via @odata.nextLink
   */
  private async fetchAllMicrosoftEvents(
    accessToken: string,
    startDateTime: string,
    endDateTime: string
  ): Promise<any[]> {
    let url: string | null = `https://graph.microsoft.com/v1.0/me/calendarView`;
    const allEvents: any[] = [];

    while (url) {
      const response = await axios.get(url, {
        params: url.includes('calendarView')
          ? {
            startDateTime,
            endDateTime,
            $orderby: 'start/dateTime',
            $top: 1000
          }
          : undefined, // when following nextLink, params are already embedded
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          Prefer: 'outlook.timezone="Europe/Paris"'
        },
        timeout: 15000,
        family: 4,
        proxy: false
      });

      const data = response.data || {};
      const pageEvents = Array.isArray(data.value) ? data.value : [];
      if (pageEvents.length) allEvents.push(...pageEvents);

      const nextLink = data['@odata.nextLink'] as string | undefined;
      url = nextLink || null;
    }

    this.logger.log(`🟦 Microsoft pagination gathered ${allEvents.length} event(s)`);
    return allEvents;
  }

  /**
   * Parse Microsoft Calendar event to our event format
   */
  private parseMicrosoftCalendarEvent(msEvent: any): any[] | null {
    try {
      const eventInfo: any = {};

      // Extract event title
      eventInfo.title = msEvent.subject || 'Untitled Event';

      // Extract event ID (base ID for multi-day events)
      eventInfo.uid = msEvent.id;

      // Extract description
      eventInfo.description = msEvent.bodyPreview || msEvent.body?.content || '';

      // Extract start time and date
      const start = msEvent.start?.dateTime;
      const end = msEvent.end?.dateTime;
      const startTimeZone = msEvent.start?.timeZone || 'Europe/Paris';

      if (!start) {
        this.logger.warn('⚠️ Microsoft event missing start time');
        return null;
      }

      // Check if all-day event
      eventInfo.isAllDay = msEvent.isAllDay || false;

      if (eventInfo.isAllDay) {
        // All-day event - check if it spans multiple days
        const startDate = new Date(start);
        const endDate = new Date(end);
        
        // Calculate number of days
        const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
          // Multi-day event - create separate events for each day
          this.logger.log(`📅 Multi-day Microsoft event detected: ${eventInfo.title} spans ${daysDiff} days`);
          const events: any[] = [];
          
          for (let i = 0; i < daysDiff; i++) {
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const dayEvent = {
              ...eventInfo,
              uid: `${eventInfo.uid}_day${i + 1}`, // Unique ID for each day
              startDate: currentDate.toISOString().split('T')[0],
              startTimeFormatted: '00:00',
              endTimeFormatted: '23:59',
              isAllDay: true
            };
            
            events.push(dayEvent);
          }
          
          return events;
        } else {
          // Single day all-day event
          eventInfo.startDate = startDate.toISOString().split('T')[0];
          eventInfo.startTimeFormatted = '00:00';
          eventInfo.endTimeFormatted = '23:59';
        }
      } else {
        // Timed event
        // Microsoft returns time in the format: "2024-11-15T14:00:00.0000000"
        // The timezone is specified separately in start.timeZone

        // Parse the datetime string directly (it's already in the correct timezone)
        const startDateTimeParts = start.split('T');
        const startDatePart = startDateTimeParts[0]; // YYYY-MM-DD
        const startTimePart = startDateTimeParts[1].split('.')[0]; // HH:MM:SS

        const endDateTimeParts = end.split('T');
        const endTimePart = endDateTimeParts[1].split('.')[0]; // HH:MM:SS

        eventInfo.startDate = startDatePart;
        eventInfo.startTimeFormatted = startTimePart.substring(0, 5); // HH:MM
        eventInfo.endTimeFormatted = endTimePart.substring(0, 5); // HH:MM
        eventInfo.startTimeLocal = eventInfo.startTimeFormatted;
        eventInfo.startDateLocal = eventInfo.startDate;
        eventInfo.timezone = startTimeZone;

        this.logger.log(`📋 Microsoft event time: ${start} to ${end} (timezone: ${startTimeZone})`);
      }

      // Log parsed event
      this.logger.log(`📋 Parsed Microsoft event: ${eventInfo.title} on ${eventInfo.startDate} at ${eventInfo.startTimeFormatted} - ${eventInfo.endTimeFormatted}`);

      return [eventInfo]; // Return array for consistency

    } catch (error) {
      this.logger.warn('⚠️ Error parsing Microsoft Calendar event:', error);
      return null;
    }
  }

  /**
   * Refresh Microsoft token specifically for sync operations
   */
  private async refreshMicrosoftTokenForSync(connector: any): Promise<string | null> {
    try {
      const microsoftCreds = connector.connector_creds.microsoft;

      if (!microsoftCreds?.refreshToken) {
        throw new Error('Missing Microsoft refresh token');
      }

      const clientId = process.env.MICROSOFT_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
      const tenantId = process.env.MICROSOFT_TENANT_ID;

      if (!clientId || !clientSecret || !tenantId) {
        throw new Error('Microsoft OAuth credentials are not configured');
      }

      const refreshToken = microsoftCreds.refreshToken;

      // Exchange refresh token for new access token
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: microsoftCreds.scope || 'https://graph.microsoft.com/Calendars.ReadWrite offline_access'
      });

      // Use axios for better network compatibility
      const response = await axios.post(tokenUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 10000, // 10 second timeout
        family: 4,
        proxy: false
      });

      const tokenData = response.data;

      if (!tokenData || !tokenData.access_token) {
        this.logger.error('❌ Microsoft token refresh failed: Invalid response', tokenData);
        // Mark connector as invalid
        connector.connector_creds.microsoft.isValid = false;
        await connector.save();
        return null;
      }

      // Update access token in database
      const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

      connector.connector_creds.microsoft.accessToken = tokenData.access_token;
      connector.connector_creds.microsoft.expiresIn = tokenData.expires_in;
      connector.connector_creds.microsoft.expiresAt = newExpiresAt;
      connector.connector_creds.microsoft.isValid = true;

      // Keep existing refresh token if not provided
      if (tokenData.refresh_token) {
        connector.connector_creds.microsoft.refreshToken = tokenData.refresh_token;
      }

      await connector.save();

      this.logger.log('✅ Microsoft token refreshed successfully for sync');
      return tokenData.access_token;

    } catch (error) {
      this.logger.error('❌ Error refreshing Microsoft token for sync:', error);

      // Mark connector as invalid if authentication failed
      if (error.response?.status === 401 || error.response?.status === 400) {
        try {
          connector.connector_creds.microsoft.isValid = false;
          await connector.save();
          this.logger.warn('⚠️ Marked Microsoft connector as invalid due to auth failure');
        } catch (saveError) {
          this.logger.error('❌ Failed to mark connector as invalid:', saveError);
        }
      }

      return null;
    }
  }

  /**
   * Save events to database with duplicate prevention
   */
  private async saveEventsToDatabase(events: any[], userId: any, source: string): Promise<number> {
    try {
      let savedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      this.logger.log(`💾 Processing ${events.length} events from ${source} for user ${userId}`);
      
      for (const eventInfo of events) {
        try {
          this.logger.log(`🔍 Processing event: ${eventInfo.title} on ${eventInfo.startDate} at ${eventInfo.startTimeFormatted}`);
          
          // Check if event already exists by external event ID (UID)
          const existingExternalEvent = await this.eventModel
            .findOne({
              userId: userId,
              externalEventId: eventInfo.uid,
              externalCalendarSource: source
            })
            .exec();

          // Prepare final times based on source before creating/updating
          let finalEventTime = eventInfo.startTimeFormatted || '00:00';
          let finalEventEndTime = eventInfo.endTimeFormatted || null;
          if (source === 'orange') {
            finalEventTime = this.addHoursToTimeString(eventInfo.startTimeFormatted, 3) || '00:00';
            if (eventInfo.endTimeFormatted) {
              finalEventEndTime = this.addHoursToTimeString(eventInfo.endTimeFormatted, 3);
            }
          } else if (source === 'google') {
            finalEventTime = eventInfo.startTimeFormatted || '00:00';
            finalEventEndTime = eventInfo.endTimeFormatted;
          } else if (source === 'microsoft') {
            finalEventTime = eventInfo.startTimeFormatted || '00:00';
            finalEventEndTime = eventInfo.endTimeFormatted;
          }

          if (existingExternalEvent) {
            // Compute diffs and update if needed (upsert behavior)
            const updateFields: any = {};
            const newEventDate = new Date(eventInfo.startDate);

            if (!existingExternalEvent.eventDate || existingExternalEvent.eventDate.toISOString().split('T')[0] !== eventInfo.startDate) {
              updateFields.eventDate = newEventDate;
            }
            if (existingExternalEvent.eventTime !== finalEventTime) {
              updateFields.eventTime = finalEventTime;
            }
            if ((existingExternalEvent as any).eventEndTime !== finalEventEndTime) {
              updateFields.eventEndTime = finalEventEndTime;
            }
            
            // Truncate event name if too long (max 200 characters)
            const maxNameLength = 200;
            let eventName = eventInfo.title || 'Untitled Event';
            if (eventName.length > maxNameLength) {
              eventName = eventName.substring(0, maxNameLength - 3) + '...';
              this.logger.warn(`⚠️ Event name truncated from ${eventInfo.title.length} to ${maxNameLength} characters`);
            }
            
            if (existingExternalEvent.eventName !== eventName) {
              updateFields.eventName = eventName;
            }
            if (existingExternalEvent.eventDescription !== (eventInfo.description || '')) {
              updateFields.eventDescription = eventInfo.description || '';
            }
            // Normalize isAllDay to boolean
            const incomingAllDay = !!(eventInfo.isAllDay || false);
            if ((existingExternalEvent as any).isAllDay !== incomingAllDay) {
              updateFields.isAllDay = incomingAllDay;
            }
            // If we ever pass status from providers, honor it. Otherwise keep 'active'.
            if (eventInfo.status && existingExternalEvent.eventStatus !== eventInfo.status) {
              updateFields.eventStatus = eventInfo.status;
            }

            if (Object.keys(updateFields).length > 0) {
              await this.eventModel.updateOne({ _id: existingExternalEvent._id }, { $set: updateFields }).exec();
              updatedCount++;
              this.logger.log(`♻️ Updated external event: ${eventInfo.title?.substring(0, 50)}${eventInfo.title?.length > 50 ? '...' : ''} on ${eventInfo.startDate} → ${finalEventTime} - ${finalEventEndTime || 'N/A'} (${source})`);
            } else {
              skippedCount++;
              this.logger.log(`⏭️ External event unchanged (skipped): ${eventInfo.title} on ${eventInfo.startDate} (${source})`);
            }
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
            // Link and update the booking event instead of creating a duplicate external event
            const bookingUpdate: any = {
              externalEventId: eventInfo.uid,
              externalCalendarSource: source
            };

            if (existingBookingEvent.eventTime !== finalEventTime) {
              bookingUpdate.eventTime = finalEventTime;
            }
            if ((existingBookingEvent as any).eventEndTime !== finalEventEndTime) {
              bookingUpdate.eventEndTime = finalEventEndTime;
            }
            // If date differs, update
            const incomingDateStr = new Date(eventInfo.startDate).toISOString().split('T')[0];
            const existingDateStr = existingBookingEvent.eventDate?.toISOString().split('T')[0];
            if (existingDateStr !== incomingDateStr) {
              bookingUpdate.eventDate = new Date(eventInfo.startDate);
            }

            if (Object.keys(bookingUpdate).length > 0) {
              await this.eventModel.updateOne({ _id: existingBookingEvent._id }, { $set: bookingUpdate }).exec();
              updatedCount++;
              this.logger.log(`🔗 Updated linked booking event with external ID: ${eventInfo.title} → ${finalEventTime} - ${finalEventEndTime || 'N/A'} (${source})`);
            } else {
              skippedCount++;
              this.logger.log(`⏭️ Booking event already up-to-date (skipped): ${eventInfo.title} on ${eventInfo.startDate}`);
            }
            continue;
          }

          // Debug logging for timezone issues
          this.logger.log(`🔍 Saving event from ${source}:`);
          this.logger.log(`   📅 Original startTime: ${eventInfo.startTime}`);
          this.logger.log(`   🕐 Formatted startTime: ${eventInfo.startTimeFormatted}`);
          this.logger.log(`   🌍 Timezone: ${eventInfo.timezone}`);
          this.logger.log(`   📍 StartTimeLocal: ${eventInfo.startTimeLocal}`);
          if (source === 'orange') {
            this.logger.log(`   🍊 Applied 3-hour Orange Calendar adjustment: ${eventInfo.startTimeFormatted} → ${finalEventTime}`);
          } else if (source === 'google') {
            this.logger.log(`   🔵 Using Google Calendar time as-is (already in Paris timezone): ${finalEventTime} - ${finalEventEndTime}`);
          } else if (source === 'microsoft') {
            this.logger.log(`   🟦 Using Microsoft Calendar time as-is (already in Paris timezone): ${finalEventTime} - ${finalEventEndTime}`);
          }

          // Truncate event name if too long (max 200 characters)
          const maxNameLength = 200;
          let eventName = eventInfo.title || 'Untitled Event';
          if (eventName.length > maxNameLength) {
            eventName = eventName.substring(0, maxNameLength - 3) + '...';
            this.logger.warn(`⚠️ Event name truncated from ${eventInfo.title.length} to ${maxNameLength} characters`);
          }

          // Create new event document
          const newEvent = new this.eventModel({
            userId: userId,
            eventName: eventName,
            eventDate: new Date(eventInfo.startDate),
            eventTime: finalEventTime,
            eventEndTime: finalEventEndTime, // Save the end time
            eventDescription: eventInfo.description || '',
            eventType: 'external',
            externalCalendarSource: source,
            externalEventId: eventInfo.uid,
            eventStatus: 'active',
            isAllDay: eventInfo.isAllDay || false
          });

          await newEvent.save();
          savedCount++;

          this.logger.log(`✅ Saved event: ${eventInfo.title} on ${eventInfo.startDate} at ${finalEventTime} - ${finalEventEndTime || 'N/A'} (${source} calendar)`);

        } catch (saveError) {
          this.logger.error(`❌ Error saving event ${eventInfo.title}:`, saveError);
        }
      }

      this.logger.log(`📊 Save summary for ${source}: ${savedCount} new, ${updatedCount} updated, ${skippedCount} unchanged`);
      
      if (updatedCount > 0) {
        this.logger.log(`📈 Updated ${updatedCount} existing external event(s)`);
      }
      return savedCount + updatedCount;
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
   @desc - run cron job to sync events every 1 hour
  */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: 'Europe/Paris' })
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
