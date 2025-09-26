import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as dav from 'dav';
import { EncryptionService } from '../common/encryption.service';
import { Connector } from '../schemas/connector.schema';
import { User } from '../schemas/user.schema';

export interface OrangeConnectorServiceDto {
  username: string;
  password: string;
}

@Injectable()
export class ConnectorService {
  constructor(
    @InjectModel(Connector.name) private connectorModel: Model<Connector>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /**
   * Validate Orange CalDAV credentials by attempting to connect
   * @param username - Orange email username
   * @param password - Plain text password
   * @returns Promise<boolean> - true if credentials are valid
   */
  private async validateOrangeCalDAVCredentials(username: string, password: string): Promise<boolean> {
    try {
      console.log('Validating Orange CalDAV credentials for:', username);

      const xhr = new dav.transport.Basic(
        new dav.Credentials({
          username: username,
          password: password
        })
      );

      // Attempt to discover calendars to validate credentials
      const account = await dav.createAccount({
        server: 'https://caldav.orange.fr',
        xhr: xhr,
        accountType: 'caldav'
      });

      console.log(`✅ CalDAV validation successful! Found ${account.calendars.length} calendar(s)`);
      return true;
    } catch (error) {
      console.error('❌ CalDAV validation failed:', error.message);
      
      // Handle specific authentication errors
      if (error.message.includes('Unauthorized') || error.status === 401) {
        throw new BadRequestException('Invalid Orange email credentials. Please check your username and password.');
      }
      
      if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
        throw new BadRequestException('Unable to connect to Orange CalDAV server. Please try again later.');
      }

      throw new BadRequestException('Failed to validate Orange calendar credentials. Please check your credentials and try again.');
    }
  }

  /**
   * Connect or update Orange calendar for a user
   * @param userId - User ID
   * @param connectorData - Orange connector credentials
   * @returns Updated or created connector
   */
  async connectOrangeCalendar(userId: string, connectorData: OrangeConnectorServiceDto): Promise<Connector> {
    const userObjectId = new Types.ObjectId(userId);
    
    // Verify user exists
    const user = await this.userModel.findById(userObjectId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      // Validate CalDAV credentials before saving
      console.log('🔍 Validating Orange CalDAV credentials...');
      await this.validateOrangeCalDAVCredentials(connectorData.username, connectorData.password);
      console.log('✅ CalDAV credentials validated successfully');

      // Encrypt password using AES (reversible for CalDAV operations)
      const encryptedPassword = EncryptionService.encrypt(connectorData.password);

      // Check if connector already exists for this user and Orange
      const existingConnector = await this.connectorModel.findOne({ 
        userId: userObjectId,
        connector_name: 'orange'
      });

      if (existingConnector) {
        // Update existing Orange connector
        existingConnector.connector_creds = {
          ...existingConnector.connector_creds,
          orange: {
            username: connectorData.username,
            password: encryptedPassword,
            isActive: true,
            isValid: true
          }
        };

        await existingConnector.save();

        const updatedConnector = await this.connectorModel
          .findById(existingConnector._id)
          .populate('userId', 'firstName lastName email domainName')
          .exec();

        if (!updatedConnector) {
          throw new NotFoundException('Failed to retrieve updated connector');
        }

        return updatedConnector;
      } else {
        // Create new connector
        const newConnector = new this.connectorModel({
          userId: userObjectId,
          connector_name: 'orange',
          connector_creds: {
            orange: {
              username: connectorData.username,
              password: encryptedPassword,
              isActive: true,
              isValid: true
            },
            ovh: null,
            microsoft: null
          }
        });

        await newConnector.save();

        const createdConnector = await this.connectorModel
          .findById(newConnector._id)
          .populate('userId', 'firstName lastName email domainName')
          .exec();

        if (!createdConnector) {
          throw new NotFoundException('Failed to retrieve created connector');
        }

        return createdConnector;
      }
    } catch (error) {
      console.error('Error in connectOrangeCalendar:', error);
      if (error.code === 11000) {
        throw new BadRequestException('Connector already exists for this user and provider');
      }
      throw error;
    }
  }

  /**
   * Get user's Orange calendar connection status
   * @param userId - User ID
   * @returns Orange connector if exists
   */
  async getOrangeConnector(userId: string): Promise<Connector | null> {
    const userObjectId = new Types.ObjectId(userId);
    
    const connector = await this.connectorModel
      .findOne({ 
        userId: userObjectId,
        connector_name: 'orange'
      })
      .populate('userId', 'firstName lastName email domainName')
      .exec();

    return connector;
  }

  /**
   * Disconnect Orange calendar
   * @param userId - User ID
   * @returns Success confirmation
   */
  async disconnectOrangeCalendar(userId: string): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    
    const connector = await this.connectorModel.findOne({ 
      userId: userObjectId,
      connector_name: 'orange'
    });

    if (!connector) {
      throw new NotFoundException('Orange connector not found for this user');
    }

    if (connector.connector_creds?.orange) {
      connector.connector_creds.orange.isActive = false;
      await connector.save();
    }
  }

  /**
   * Get Orange CalDAV client for event operations
   * Now uses encrypted credentials that can be decrypted for CalDAV
   * @param userId - User ID
   * @returns CalDAV account object or null
   */
  async getOrangeCalDAVClient(userId: string): Promise<any> {
    try {
      const connector = await this.getOrangeConnector(userId);
      
      if (!connector?.connector_creds?.orange?.username || !connector?.connector_creds?.orange?.password) {
        throw new NotFoundException('Orange connector not found or incomplete for this user');
      }

      // Decrypt password for CalDAV operations
      const decryptedPassword = EncryptionService.decrypt(connector.connector_creds.orange.password);

      // Create CalDAV client with decrypted credentials
      const xhr = new dav.transport.Basic(
        new dav.Credentials({
          username: connector.connector_creds.orange.username,
          password: decryptedPassword // Now we can decrypt for CalDAV
        })
      );

      const account = await dav.createAccount({
        server: 'https://caldav.orange.fr',
        xhr: xhr,
        accountType: 'caldav'
      });

      console.log(`📅 CalDAV client ready! Found ${account.calendars.length} calendar(s)`);
      return account;
    } catch (error) {
      console.error('Error creating CalDAV client:', error);
      throw error;
    }
  }

  /**
   * Verify Orange calendar credentials using stored encrypted password
   * @param userId - User ID
   * @param plainPassword - Plain text password to verify against stored encrypted version
   * @returns Boolean indicating if password matches
   */
  async verifyOrangeCredentials(userId: string, plainPassword: string): Promise<boolean> {
    try {
      const connector = await this.getOrangeConnector(userId);
      
      if (!connector?.connector_creds?.orange?.password) {
        return false;
      }

      // Decrypt stored password and compare
      const decryptedStoredPassword = EncryptionService.decrypt(connector.connector_creds.orange.password);
      return plainPassword === decryptedStoredPassword;
    } catch (error) {
      console.error('Error verifying credentials:', error);
      return false;
    }
  }

  /**
   * Example: Create CalDAV event (for future implementation)
   * This demonstrates how encrypted passwords work with CalDAV operations
   * @param userId - User ID
   * @param eventData - Event details
   * @returns Event creation result
   */
  async createOrangeCalendarEvent(userId: string, eventData: any): Promise<any> {
    try {
      console.log('🗓️ Creating Orange calendar event...');

      // Get CalDAV client with automatically decrypted credentials
      const account = await this.getOrangeCalDAVClient(userId);
      
      if (!account.calendars || account.calendars.length === 0) {
        throw new NotFoundException('No calendars found for this user');
      }

      // Use first calendar (you can add calendar selection logic)
      const calendar = account.calendars[0];
      console.log(`📅 Using calendar: ${calendar.displayName || 'Default Calendar'}`);

      // Here you would implement the actual event creation
      // using your existing OrangeMailCalendarClient logic from app.js
      console.log('📝 Event data received:', eventData);
      console.log('🔑 Credentials decrypted and ready for CalDAV operations');

      return {
        success: true,
        message: 'CalDAV client ready for event creation',
        calendarUrl: calendar.url,
        calendarName: calendar.displayName
      };
    } catch (error) {
      console.error('Error creating CalDAV event:', error);
      throw error;
    }
  }
}
