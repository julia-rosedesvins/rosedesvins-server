import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dav from 'dav';
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

      // Hash the password before storing (for security)
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(connectorData.password, saltRounds);

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
            password: hashedPassword,
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
              password: hashedPassword,
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
   * Verify Orange calendar credentials (for future use)
   * @param userId - User ID
   * @param password - Plain text password to verify
   * @returns Boolean indicating if password matches
   */
  async verifyOrangeCredentials(userId: string, password: string): Promise<boolean> {
    const connector = await this.getOrangeConnector(userId);
    
    if (!connector?.connector_creds?.orange?.password) {
      return false;
    }

    return await bcrypt.compare(password, connector.connector_creds.orange.password);
  }

  /**
   * Get Orange CalDAV client for event operations
   * Note: This requires storing the original password temporarily or using a different approach
   * For production, consider using app-specific passwords or OAuth tokens
   * @param userId - User ID
   * @param plainPassword - The original password (needed for CalDAV operations)
   * @returns CalDAV account object or null
   */
  async getOrangeCalDAVClient(userId: string, plainPassword: string): Promise<any> {
    try {
      const connector = await this.getOrangeConnector(userId);
      
      if (!connector?.connector_creds?.orange?.username) {
        throw new NotFoundException('Orange connector not found for this user');
      }

      // Verify the provided password matches stored hash
      const isValidPassword = await bcrypt.compare(plainPassword, connector.connector_creds.orange.password);
      if (!isValidPassword) {
        throw new BadRequestException('Invalid password provided');
      }

      // Create CalDAV client with plain text credentials
      const xhr = new dav.transport.Basic(
        new dav.Credentials({
          username: connector.connector_creds.orange.username,
          password: plainPassword // CalDAV needs plain text password
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
}
