import { Injectable, BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Connector } from '../../schemas/connector.schema';

export interface GoogleEventData {
  summary: string;
  description?: string;
  location?: string;
  startDateTime: string; // Format: YYYY-MM-DDTHH:mm:ss
  endDateTime: string; // Format: YYYY-MM-DDTHH:mm:ss
  attendees?: Array<{
    email: string;
    displayName?: string;
  }>;
  timeZone?: string;
}

@Injectable()
export class GoogleEventsApiService {
  constructor(
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
    private configService: ConfigService,
  ) {}

  /**
   * Get Google access token with automatic refresh if expired
   * @param userId - User ID to get token for
   * @returns Valid access token or null if failed
   */
  async getGoogleAccessToken(userId: string): Promise<string | null> {
    try {
      console.log('🔍 Getting Google access token for user:', userId);
      
      const connector = await this.connectorModel.findOne({
        userId: new Types.ObjectId(userId),
        connector_name: 'google'
      }).exec();
      
      if (!connector) {
        console.log('❌ No Google connector found for user:', userId);
        return null;
      }

      if (!connector.connector_creds?.google) {
        console.log('❌ No Google credentials found in connector');
        return null;
      }

      if (!connector.connector_creds.google.accessToken) {
        console.log('❌ No access token found in Google credentials');
        return null;
      }

      const google = connector.connector_creds.google;
      
      console.log('🔍 Google token info:', {
        hasAccessToken: !!google.accessToken,
        hasRefreshToken: !!google.refreshToken,
        isValid: google.isValid,
        isActive: google.isActive,
        expiresAt: google.expiresAt,
        now: new Date(),
        timeUntilExpiry: new Date(google.expiresAt).getTime() - Date.now()
      });
      
      // Check if token is still valid and active
      if (!google.isValid || !google.isActive) {
        console.log('❌ Google token is not valid or not active');
        return null;
      }

      // Check if token is expired (with 5 minute buffer)
      const now = new Date();
      const expiresAt = new Date(google.expiresAt);
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      
      if (now.getTime() > (expiresAt.getTime() - bufferTime)) {
        console.log('🔄 Google token expired, attempting refresh...');
        const refreshed = await this.refreshGoogleToken(userId);
        
        if (!refreshed) {
          console.log('❌ Failed to refresh Google token');
          return null;
        }
        
        // Get the refreshed connector
        const refreshedConnector = await this.connectorModel.findOne({
          userId: new Types.ObjectId(userId),
          connector_name: 'google'
        }).exec();
        
        const newToken = refreshedConnector?.connector_creds?.google?.accessToken || null;
        console.log('✅ Token refreshed successfully:', !!newToken);
        return newToken;
      }

      console.log('✅ Using existing valid Google token');
      return google.accessToken;
      
    } catch (error) {
      console.error('❌ Error getting Google access token:', error);
      return null;
    }
  }

  /**
   * Refresh Google access token using refresh token
   * @param userId - User ID
   * @returns Success status
   */
  async refreshGoogleToken(userId: string): Promise<boolean> {
    try {
      const connector = await this.connectorModel.findOne({
        userId: new Types.ObjectId(userId),
        connector_name: 'google'
      }).exec();
      
      if (!connector?.connector_creds?.google?.refreshToken) {
        throw new BadRequestException('Google connector not found or missing refresh token');
      }

      const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

      if (!clientId || !clientSecret) {
        throw new BadRequestException('Google OAuth credentials are not configured');
      }

      const refreshToken = connector.connector_creds.google.refreshToken;

      // Exchange refresh token for new access token
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params,
        // Use IPv4 to avoid network issues
        // @ts-ignore
        family: 4,
        proxy: false
      });

      const tokenData = await response.json();

      if (!response.ok) {
        console.error('❌ Token refresh failed:', tokenData);
        // Mark connector as invalid
        connector.connector_creds.google.isValid = false;
        await connector.save();
        return false;
      }

      // Update access token in database
      const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
      
      connector.connector_creds.google.accessToken = tokenData.access_token;
      connector.connector_creds.google.expiresIn = tokenData.expires_in;
      connector.connector_creds.google.expiresAt = newExpiresAt;
      connector.connector_creds.google.isValid = true;
      
      // Note: Google doesn't always return a new refresh token
      // Keep the existing refresh token if not provided
      if (tokenData.refresh_token) {
        connector.connector_creds.google.refreshToken = tokenData.refresh_token;
      }

      await connector.save();

      console.log('✅ Google token refreshed successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Error refreshing Google token:', error);
      return false;
    }
  }

  /**
   * Create event in Google Calendar with automatic token refresh
   * @param userId - User ID who owns the calendar
   * @param eventData - Event details to create
   * @returns Created event ID or null if failed
   */
  async createGoogleCalendarEvent(
    userId: string,
    eventData: GoogleEventData
  ): Promise<string | null> {
    try {
      console.log('📅 Creating Google Calendar event for user:', userId);
      
      // Get valid access token (automatically refreshes if needed)
      const accessToken = await this.getGoogleAccessToken(userId);
      
      if (!accessToken) {
        console.error('❌ Failed to get valid Google access token');
        return null;
      }

      // Prepare Google Calendar API event body
      // Use datetime strings directly without timezone conversion
      const eventBody = {
        summary: eventData.summary,
        description: eventData.description || '',
        location: eventData.location || '',
        start: {
          dateTime: eventData.startDateTime, // Already in correct format: YYYY-MM-DDTHH:mm:ss
          timeZone: eventData.timeZone || 'Europe/Paris'
        },
        end: {
          dateTime: eventData.endDateTime, // Already in correct format: YYYY-MM-DDTHH:mm:ss
          timeZone: eventData.timeZone || 'Europe/Paris'
        },
        attendees: eventData.attendees?.map(attendee => ({
          email: attendee.email,
          displayName: attendee.displayName
        })) || [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'popup', minutes: 30 } // 30 minutes before
          ]
        }
      };

      console.log('📤 Making Google Calendar API request to create event');
      console.log('📋 Event body:', JSON.stringify(eventBody, null, 2));

      // Create event via Google Calendar API
      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(eventBody),
          // Use IPv4 to avoid network issues
          // @ts-ignore
          family: 4,
          proxy: false
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Google Calendar API error response:', errorData);
        throw new Error(`Google Calendar API error: ${response.status} - ${errorData}`);
      }

      const createdEvent = await response.json();
      
      console.log('✅ Google Calendar event created successfully:', createdEvent.id);
      console.log('🔗 Event link:', createdEvent.htmlLink);

      return createdEvent.id;
      
    } catch (error) {
      console.error('❌ Failed to create Google Calendar event:', error);
      
      // Provide specific error messages
      if (error.message?.includes('401')) {
        console.error('🚫 Authentication failed - token may be invalid');
      } else if (error.message?.includes('403')) {
        console.error('🚫 Permission denied - check calendar API scopes');
      } else if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        console.error('⏰ Network timeout when calling Google Calendar API');
      }
      
      return null;
    }
  }

  /**
   * Wrapper function to create event with retry logic
   * This is the main function to be called from user-bookings.service
   */
  async addBookingToGoogleCalendar(
    userId: string,
    eventData: GoogleEventData
  ): Promise<string | null> {
    try {
      console.log('🔗 Starting Google Calendar integration for booking');
      
      // Create the event (token refresh is handled internally)
      const eventId = await this.createGoogleCalendarEvent(userId, eventData);
      
      if (!eventId) {
        throw new Error('Failed to create Google Calendar event');
      }
      
      return eventId;
      
    } catch (error) {
      console.error('❌ Google Calendar integration error:', error);
      // Non-blocking: Return null instead of throwing
      return null;
    }
  }

  /**
   * Update event in Google Calendar with automatic token refresh
   * @param userId - User ID who owns the calendar
   * @param eventId - Google Calendar event ID to update
   * @param eventData - Updated event details
   * @returns Success status
   */
  async updateGoogleCalendarEvent(
    userId: string,
    eventId: string,
    eventData: GoogleEventData
  ): Promise<boolean> {
    try {
      console.log('📅 Updating Google Calendar event:', eventId);
      
      // Get valid access token (automatically refreshes if needed)
      const accessToken = await this.getGoogleAccessToken(userId);
      
      if (!accessToken) {
        console.error('❌ Failed to get valid Google access token');
        return false;
      }

      // Prepare update body (same structure as create)
      const updateBody = {
        summary: eventData.summary,
        description: eventData.description || '',
        location: eventData.location || '',
        start: {
          dateTime: eventData.startDateTime,
          timeZone: eventData.timeZone || 'Europe/Paris'
        },
        end: {
          dateTime: eventData.endDateTime,
          timeZone: eventData.timeZone || 'Europe/Paris'
        },
        attendees: eventData.attendees?.map(attendee => ({
          email: attendee.email,
          displayName: attendee.displayName
        })) || [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 }
          ]
        }
      };

      console.log('📤 Making Google Calendar API request to update event');
      console.log('📋 Update body:', JSON.stringify(updateBody, null, 2));

      // Update event via Google Calendar API
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updateBody),
          // Use IPv4 to avoid network issues
          // @ts-ignore
          family: 4,
          proxy: false
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Google Calendar API error response:', errorData);
        
        // Handle 404 - event not found
        if (response.status === 404) {
          console.error('⚠️ Event not found in Google Calendar, may have been deleted');
          return false;
        }
        
        throw new Error(`Google Calendar API error: ${response.status} - ${errorData}`);
      }

      const updatedEvent = await response.json();
      
      console.log('✅ Google Calendar event updated successfully:', updatedEvent.id);
      console.log('🔗 Event link:', updatedEvent.htmlLink);

      return true;
      
    } catch (error) {
      console.error('❌ Failed to update Google Calendar event:', error);
      
      // Provide specific error messages
      if (error.message?.includes('401')) {
        console.error('🚫 Authentication failed - token may be invalid');
      } else if (error.message?.includes('403')) {
        console.error('🚫 Permission denied - check calendar API scopes');
      } else if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        console.error('⏰ Network timeout when calling Google Calendar API');
      }
      
      return false;
    }
  }

  /**
   * Delete event from Google Calendar with automatic token refresh
   * @param userId - User ID who owns the calendar
   * @param eventId - Google Calendar event ID to delete
   * @returns Success status
   */
  async deleteGoogleCalendarEvent(
    userId: string,
    eventId: string
  ): Promise<boolean> {
    try {
      console.log('🗑️ Deleting Google Calendar event:', eventId);
      
      // Get valid access token (automatically refreshes if needed)
      const accessToken = await this.getGoogleAccessToken(userId);
      
      if (!accessToken) {
        console.error('❌ Failed to get valid Google access token');
        return false;
      }

      console.log('📤 Making Google Calendar API request to delete event');

      // Delete event via Google Calendar API
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          // Use IPv4 to avoid network issues
          // @ts-ignore
          family: 4,
          proxy: false
        }
      );

      // Google Calendar returns 204 No Content on successful deletion
      if (response.status === 204) {
        console.log('✅ Google Calendar event deleted successfully');
        return true;
      }

      // Handle 404 - event already deleted or not found
      if (response.status === 404) {
        console.log('ℹ️ Google Calendar event not found (may have been already deleted)');
        return true; // Consider this a success since the end result is the same
      }

      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Google Calendar API error response:', errorData);
        throw new Error(`Google Calendar API error: ${response.status} - ${errorData}`);
      }

      return true;
      
    } catch (error) {
      console.error('❌ Failed to delete Google Calendar event:', error);
      
      // Provide specific error messages
      if (error.message?.includes('401')) {
        console.error('🚫 Authentication failed - token may be invalid');
      } else if (error.message?.includes('403')) {
        console.error('🚫 Permission denied - check calendar API scopes');
      } else if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
        console.error('⏰ Network timeout when calling Google Calendar API');
      }
      
      return false;
    }
  }

  /**
   * Wrapper function to update event in Google Calendar
   * This is the main function to be called from user-bookings.service
   */
  async updateBookingInGoogleCalendar(
    userId: string,
    eventId: string,
    eventData: GoogleEventData
  ): Promise<boolean> {
    try {
      console.log('🔗 Updating Google Calendar event for booking');
      
      // Update the event (token refresh is handled internally)
      const success = await this.updateGoogleCalendarEvent(userId, eventId, eventData);
      
      return success;
      
    } catch (error) {
      console.error('❌ Google Calendar update error:', error);
      // Non-blocking: Return false instead of throwing
      return false;
    }
  }

  /**
   * Wrapper function to delete event from Google Calendar
   * This is the main function to be called from user-bookings.service
   */
  async deleteBookingFromGoogleCalendar(
    userId: string,
    eventId: string
  ): Promise<boolean> {
    try {
      console.log('🔗 Deleting Google Calendar event for booking');
      
      // Delete the event (token refresh is handled internally)
      const success = await this.deleteGoogleCalendarEvent(userId, eventId);
      
      return success;
      
    } catch (error) {
      console.error('❌ Google Calendar deletion error:', error);
      // Non-blocking: Return false instead of throwing
      return false;
    }
  }
}