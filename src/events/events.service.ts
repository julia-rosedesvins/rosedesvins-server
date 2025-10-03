import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event } from '../schemas/events.schema';
import { Connector } from '../schemas/connector.schema';
import { EncryptionService } from '../common/encryption.service';
import { Buffer } from 'buffer';

const dav = require('dav');

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private calendarCache = new Map<string, { calendar: any; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL

  constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
  ) {}

  /**
   * Get all events for a specific user
   * @param userId - User ID to get events for
   * @returns Promise with user's events
   */
  async getUserEvents(userId: string): Promise<Event[]> {
    try {
      const userObjectId = new Types.ObjectId(userId);
      
      const events = await this.eventModel
        .find({ userId: userObjectId })
        .populate('bookingId', 'bookingDate bookingTime userContactFirstname userContactLastname bookingStatus') // Populate booking details if linked
        .sort({ eventDate: 1, eventTime: 1 }) // Sort by date and time ascending
        .lean()
        .exec();

      return events;
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
   * Simple test to fetch events from Orange calendar - just for debugging
   */
  async testOrangeEventsFetch(): Promise<any> {
    try {
      this.logger.log('🧪 Testing Orange calendar events fetch...');

      // Get Orange connector
      const orangeConnector = await this.connectorModel
        .findOne({ 
          connector_name: 'orange',
          'connector_creds.orange.isActive': true,
          'connector_creds.orange.isValid': true
        })
        .lean()
        .exec();

      if (!orangeConnector) {
        return {
          success: false,
          message: 'No active Orange connector found',
          data: null
        };
      }

      this.logger.log(`📧 Found Orange connector for user: ${orangeConnector.userId}`);

      const orangeCreds = orangeConnector.connector_creds.orange;
      if (!orangeCreds) {
        return {
          success: false,
          message: 'Orange credentials not found',
          data: null
        };
      }

      const decryptedPassword = EncryptionService.decrypt(orangeCreds.password);
      this.logger.log(`🔑 Using credentials: ${orangeCreds.username}`);

      // Discover calendar
      this.logger.log('🔍 Discovering Orange calendar...');
      const calendar = await this.getOrangeCalendar(orangeCreds.username, decryptedPassword);
      this.logger.log(`📅 Calendar discovered: ${calendar.url}`);

      // Try to fetch events using different methods
      this.logger.log('📋 Method 1: Testing PROPFIND to list files...');
      
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

      this.logger.log(`📊 PROPFIND Response Status: ${listResponse.status} ${listResponse.statusText}`);

      if (listResponse.ok) {
        const responseText = await listResponse.text();
        this.logger.log(`📄 Response length: ${responseText.length} characters`);
        this.logger.log(`📄 Response preview (first 1000 chars):`);
        this.logger.log(responseText.substring(0, 1000));
        
        // Count .ics files
        const icsMatches = responseText.match(/\.ics/g);
        const icsCount = icsMatches ? icsMatches.length : 0;
        this.logger.log(`📁 Found ${icsCount} .ics files`);

        // Now let's try to fetch individual .ics files
        this.logger.log('📋 Method 2: Fetching individual .ics files...');
        
        const icsFiles = this.extractIcsFilesFromResponse(responseText, calendar.url);
        this.logger.log(`📁 Extracted ${icsFiles.length} .ics file URLs`);
        
        const events: any[] = [];
        const fetchedFiles: any[] = [];

        // Get current month for filtering
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
        
        this.logger.log(`📅 Filtering for current month: ${currentYear}-${currentMonth.toString().padStart(2, '0')}`);

        // Fetch all .ics files and filter for current month
        let currentMonthEvents = 0;
        let totalProcessed = 0;
        
        for (let i = 0; i < icsFiles.length; i++) {
          const icsUrl = icsFiles[i];
          totalProcessed++;
          
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
              
              fetchedFiles.push({
                url: icsUrl,
                contentLength: icsContent.length,
                preview: icsContent.substring(0, 200),
                hasVEvent: icsContent.includes('VEVENT')
              });
              
              // Try to extract basic event info
              if (icsContent.includes('VEVENT')) {
                const eventInfo = this.extractBasicEventInfo(icsContent);
                if (eventInfo && eventInfo.startDate) {
                  // Check if event is in current month
                  const eventDate = new Date(eventInfo.startDate);
                  if (eventDate.getFullYear() === currentYear && (eventDate.getMonth() + 1) === currentMonth) {
                    events.push(eventInfo);
                    currentMonthEvents++;
                    this.logger.log(`📅 Current month event found: ${eventInfo.title} on ${eventInfo.startDate}`);
                  } else {
                    this.logger.log(`📅 Event not in current month: ${eventInfo.title} on ${eventInfo.startDate}`);
                  }
                }
              }
              
            } else {
              this.logger.warn(`⚠️ Failed to fetch .ics file ${i+1}: ${icsResponse.status} ${icsResponse.statusText}`);
            }
          } catch (fetchError) {
            this.logger.warn(`⚠️ Error fetching .ics file ${i+1}: ${fetchError.message}`);
          }
        }
        
        this.logger.log(`📊 Summary: Processed ${totalProcessed} files, found ${currentMonthEvents} current month events`);

        return {
          success: true,
          message: `Orange calendar test successful. Found ${icsCount} .ics files, fetched ${fetchedFiles.length} files, found ${currentMonthEvents} current month events (${currentYear}-${currentMonth.toString().padStart(2, '0')}).`,
          data: {
            userId: orangeConnector.userId,
            username: orangeCreds.username,
            calendarUrl: calendar.url,
            responseStatus: listResponse.status,
            responseLength: responseText.length,
            icsFilesFound: icsCount,
            icsFilesFetched: fetchedFiles.length,
            totalProcessed: totalProcessed,
            currentMonthEvents: currentMonthEvents,
            filterMonth: `${currentYear}-${currentMonth.toString().padStart(2, '0')}`,
            eventsParsed: events.length,
            responsePreview: responseText.substring(0, 500),
            fetchedFiles: fetchedFiles.slice(0, 3), // Only show first 3 for brevity
            events: events
          }
        };
      } else {
        this.logger.error(`❌ PROPFIND failed: ${listResponse.status} ${listResponse.statusText}`);
        return {
          success: false,
          message: `PROPFIND failed: ${listResponse.status} ${listResponse.statusText}`,
          data: {
            userId: orangeConnector.userId,
            username: orangeCreds.username,
            calendarUrl: calendar.url,
            responseStatus: listResponse.status,
            error: listResponse.statusText
          }
        };
      }

    } catch (error) {
      this.logger.error('❌ Orange test error:', error);
      return {
        success: false,
        message: `Test failed: ${error.message}`,
        error: error.message
      };
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
      
      // Extract DTSTART (start date/time)
      const dtstartMatch = icsContent.match(/DTSTART[^:]*:(.*?)(?:\r?\n)/);
      if (dtstartMatch) {
        eventInfo.startTime = dtstartMatch[1].trim();
        
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
            
            // Convert UTC to local time for display (Orange events are often in UTC)
            if (dateStr.endsWith('Z')) {
              const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
              const localDate = new Date(utcDate.getTime());
              
              eventInfo.startDateLocal = localDate.toISOString().split('T')[0];
              eventInfo.startTimeLocal = localDate.toTimeString().substring(0, 5);
              eventInfo.timezone = 'UTC';
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
      this.logger.log(`📧 Using Orange credentials for user: ${orangeCreds.username}`);

      // Get calendar with caching and retry logic
      const calendar = await this.getOrangeCalendar(orangeCreds.username, decryptedPassword);
      this.logger.log(`📅 Calendar URL: ${calendar.url}`);

      // Fetch events from Orange calendar using our working method
      this.logger.log('📋 Fetching events from Orange calendar...');
      
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
      this.logger.log(`📁 Found ${icsFiles.length} .ics files`);

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

      this.logger.log(`📅 Found ${events.length} current month events to sync`);

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
          const existingEvent = await this.eventModel
            .findOne({
              userId: userId,
              externalEventId: eventInfo.uid,
              externalCalendarSource: source
            })
            .exec();

          if (existingEvent) {
            this.logger.log(`⏭️ Event ${eventInfo.title} already exists, skipping...`);
            continue;
          }

          // Create new event document
          const newEvent = new this.eventModel({
            userId: userId,
            eventName: eventInfo.title || 'Untitled Event',
            eventDate: new Date(eventInfo.startDate),
            eventTime: eventInfo.startTimeFormatted || '00:00',
            eventDescription: eventInfo.description || '',
            eventType: 'external',
            externalCalendarSource: source,
            externalEventId: eventInfo.uid,
            eventStatus: 'active',
            isAllDay: eventInfo.isAllDay || false
          });

          await newEvent.save();
          savedCount++;
          
          this.logger.log(`✅ Saved event: ${eventInfo.title} on ${eventInfo.startDate}`);

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
   * Fetch events from Orange calendar
   */
  private async fetchOrangeCalendarEvents(calendarUrl: string, username: string, password: string): Promise<any[]> {
    try {
      this.logger.log('📋 Fetching events from Orange calendar...');

      // Step 1: First get list of event files
      const listResponse = await fetch(calendarUrl, {
        method: 'PROPFIND',
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Depth': '1'
        },
        body: `<?xml version="1.0" encoding="utf-8" ?>
        <D:propfind xmlns:D="DAV:">
            <D:prop>
                <D:href/>
                <D:resourcetype/>
                <D:getetag/>
            </D:prop>
        </D:propfind>`
      });

      if (!listResponse.ok) {
        throw new Error(`HTTP ${listResponse.status}: ${listResponse.statusText}`);
      }

      const listResponseText = await listResponse.text();
      this.logger.log('📄 PROPFIND Response (first 500 chars):', listResponseText.substring(0, 500));

      // Extract .ics file URLs from the response
      const icsFiles = this.extractIcsFiles(listResponseText, calendarUrl);
      this.logger.log(`📁 Found ${icsFiles.length} .ics files`);

      if (icsFiles.length === 0) {
        this.logger.log('📭 No .ics files found in calendar');
        return [];
      }

      // Step 2: Fetch individual events
      const events: any[] = [];
      for (const icsFile of icsFiles.slice(0, 10)) { // Limit to first 10 events for testing
        try {
          const eventData = await this.fetchIndividualEvent(icsFile, username, password);
          if (eventData) {
            events.push(...eventData);
          }
        } catch (eventError) {
          this.logger.warn(`⚠️ Could not fetch event ${icsFile}:`, eventError.message);
        }
      }
      
      this.logger.log(`📊 Successfully parsed ${events.length} events from Orange calendar`);
      
      return events;

    } catch (error) {
      this.logger.error('Error fetching Orange calendar events:', error);
      throw error;
    }
  }

  /**
   * Extract .ics file URLs from PROPFIND response
   */
  private extractIcsFiles(responseText: string, baseCalendarUrl: string): string[] {
    const icsFiles: string[] = [];
    
    try {
      // Look for href elements containing .ics files
      const hrefMatches = responseText.match(/<D:href>([^<]*\.ics[^<]*)<\/D:href>/gi);
      
      if (hrefMatches) {
        for (const match of hrefMatches) {
          const href = match.replace(/<\/?D:href>/gi, '').trim();
          
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
   * Fetch individual event from .ics file URL
   */
  private async fetchIndividualEvent(eventUrl: string, username: string, password: string): Promise<any[] | null> {
    try {
      const response = await fetch(eventUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
          'Content-Type': 'text/calendar'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const icalContent = await response.text();
      
      if (icalContent && icalContent.includes('BEGIN:VEVENT')) {
        const events = this.parseICalContent(icalContent);
        return events;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Error fetching individual event ${eventUrl}:`, error.message);
      return null;
    }
  }

  /**
   * Parse complete iCalendar content
   */
  private parseICalContent(icalContent: string): any[] {
    const events: any[] = [];
    
    try {
      // Split content into individual events
      const eventBlocks = icalContent.split('BEGIN:VEVENT');
      
      for (let i = 1; i < eventBlocks.length; i++) { // Skip first element (before first event)
        const eventBlock = 'BEGIN:VEVENT' + eventBlocks[i];
        const endIndex = eventBlock.indexOf('END:VEVENT');
        
        if (endIndex !== -1) {
          const singleEventContent = eventBlock.substring(0, endIndex + 'END:VEVENT'.length);
          const parsedEvent = this.parseICalEvent(singleEventContent);
          
          if (parsedEvent) {
            events.push(parsedEvent);
          }
        }
      }
    } catch (error) {
      this.logger.warn('Error parsing iCal content:', error);
    }

    return events;
  }



  /**
   * Parse individual iCalendar event
   */
  private parseICalEvent(icalContent: string): any | null {
    try {
      const lines = icalContent.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      const event: any = {};

      // Handle multi-line values (lines that start with space or tab are continuations)
      const processedLines: string[] = [];
      let currentLine = '';

      for (const line of lines) {
        if (line.startsWith(' ') || line.startsWith('\t')) {
          // Continuation of previous line
          currentLine += line.substring(1);
        } else {
          if (currentLine) {
            processedLines.push(currentLine);
          }
          currentLine = line;
        }
      }
      if (currentLine) {
        processedLines.push(currentLine);
      }

      // Parse each line
      for (const line of processedLines) {
        if (line.startsWith('UID:')) {
          event.uid = line.substring(4).trim();
        } else if (line.startsWith('SUMMARY:')) {
          event.summary = line.substring(8).trim();
        } else if (line.startsWith('DESCRIPTION:')) {
          event.description = line.substring(12).trim();
        } else if (line.startsWith('DTSTART:') || line.startsWith('DTSTART;')) {
          event.startDate = this.parseICalDate(line);
        } else if (line.startsWith('DTEND:') || line.startsWith('DTEND;')) {
          event.endDate = this.parseICalDate(line);
        } else if (line.startsWith('CREATED:')) {
          event.created = this.parseICalDate(line);
        } else if (line.startsWith('LAST-MODIFIED:')) {
          event.lastModified = this.parseICalDate(line);
        } else if (line.startsWith('LOCATION:')) {
          event.location = line.substring(9).trim();
        } else if (line.startsWith('STATUS:')) {
          event.status = line.substring(7).trim();
        }
      }

      // Debug logging
      if (event.uid) {
        this.logger.log(`🔍 Parsed event: ${event.summary || 'No title'} (${event.uid})`);
        this.logger.log(`   📅 Start: ${event.startDate ? event.startDate.toISOString() : 'No date'}`);
        this.logger.log(`   📝 Description: ${event.description ? event.description.substring(0, 50) + '...' : 'None'}`);
      }

      // Only return events with required fields
      if (event.uid && event.startDate) {
        // Use UID as summary if no summary is provided
        if (!event.summary) {
          event.summary = `Event ${event.uid.substring(0, 8)}`;
        }
        return event;
      }

      this.logger.warn('⚠️ Event missing required fields (uid, startDate):', { uid: event.uid, startDate: event.startDate });
      return null;
    } catch (error) {
      this.logger.warn('Error parsing iCal event:', error);
      return null;
    }
  }

  /**
   * Parse iCalendar date format
   */
  private parseICalDate(line: string): Date | null {
    try {
      // Extract the date value after the colon
      const dateValue = line.split(':')[1]?.trim();
      if (!dateValue) return null;

      // Handle different date formats
      if (dateValue.length === 8) {
        // YYYYMMDD format (all-day event)
        const year = parseInt(dateValue.substring(0, 4));
        const month = parseInt(dateValue.substring(4, 6)) - 1; // Month is 0-indexed
        const day = parseInt(dateValue.substring(6, 8));
        return new Date(year, month, day);
      } else if (dateValue.length >= 15) {
        // YYYYMMDDTHHMMSS format (with time)
        const year = parseInt(dateValue.substring(0, 4));
        const month = parseInt(dateValue.substring(4, 6)) - 1;
        const day = parseInt(dateValue.substring(6, 8));
        const hour = parseInt(dateValue.substring(9, 11));
        const minute = parseInt(dateValue.substring(11, 13));
        const second = parseInt(dateValue.substring(13, 15));
        return new Date(year, month, day, hour, minute, second);
      }

      return null;
    } catch (error) {
      this.logger.warn('Error parsing iCal date:', error);
      return null;
    }
  }

  /**
   * Save external events to database, avoiding duplicates
   */
  private async saveExternalEventsToDatabase(externalEvents: any[], userId: Types.ObjectId, source: string): Promise<any[]> {
    const savedEvents: any[] = [];

    for (const externalEvent of externalEvents) {
      try {
        // Check if event already exists by external event ID and user
        const existingEvent = await this.eventModel.findOne({
          userId,
          externalEventId: externalEvent.uid,
          externalCalendarSource: source
        }).exec();

        if (existingEvent) {
          this.logger.log(`⏭️ Event already exists, skipping: ${externalEvent.summary || externalEvent.uid}`);
          continue;
        }

        // Extract date and time from startDate
        const startDate = new Date(externalEvent.startDate);
        const eventDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const eventTime = `${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`;

        // Create new event record
        const eventData = {
          userId,
          eventName: externalEvent.summary || 'Imported Event',
          eventDate,
          eventTime,
          eventDescription: externalEvent.description || 'Event imported from external calendar',
          eventType: 'external',
          externalCalendarSource: source,
          externalEventId: externalEvent.uid,
          eventStatus: 'active',
          isAllDay: this.isAllDayEvent(externalEvent)
        };

        const newEvent = new this.eventModel(eventData);
        const savedEvent = await newEvent.save();
        
        savedEvents.push(savedEvent);
        this.logger.log(`✅ Saved external event: ${externalEvent.summary || externalEvent.uid}`);

      } catch (saveError) {
        this.logger.error(`❌ Error saving external event ${externalEvent.uid}:`, saveError);
      }
    }

    return savedEvents;
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
}
