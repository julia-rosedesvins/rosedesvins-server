import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
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
    private configService: ConfigService,
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

      // Check if connector already exists for this user (regardless of connector_name)
      const existingConnector = await this.connectorModel.findOne({ 
        userId: userObjectId
      });

      if (existingConnector) {
        // Only one calendar can be connected at a time
        // Clear all existing credentials and set only Orange
        existingConnector.connector_creds = {
          orange: {
            username: connectorData.username,
            password: encryptedPassword,
            isActive: true,
            isValid: true
          },
          ovh: null,
          microsoft: null
        };

        // Update connector_name to 'orange'
        existingConnector.connector_name = 'orange';

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
        // Create new connector document for this user
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
        userId: userObjectId
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
      userId: userObjectId
    });

    if (!connector) {
      throw new NotFoundException('Connector not found for this user');
    }

    // Clear the orange credentials and set connector_name to 'none'
    if (connector.connector_creds) {
      connector.connector_creds.orange = null;
      connector.connector_name = 'none';
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

  /**
   * Generate Microsoft OAuth URL for calendar permissions
   * @param userId - User ID requesting the OAuth URL
   * @returns Promise<{authUrl: string, state: string}> - OAuth URL and state for verification
   */
  async generateMicrosoftOAuthUrl(userId: string): Promise<{
    authUrl: string;
    state: string;
  }> {
    try {
      console.log('🔗 Generating Microsoft OAuth URL for user:', userId);

      // Microsoft OAuth 2.0 parameters
      const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID') || '09887ad9-bf96-48b1-978f-941e19cfcfbf';
      const tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID') || '009f53c5-6b44-4bc8-8cce-19cfad319c6e';
      const redirectUri = this.configService.get<string>('MICROSOFT_REDIRECT_URI') || 'http://localhost:3000/connectors/microsoft/callback';
      
      // Generate a unique state parameter for security (prevents CSRF attacks)
      const state = `${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      
      // Required scopes for calendar operations
      // Using openid profile email for unapproved apps
      const scopes = [
        'openid',
        'profile', 
        'email',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/User.Read',
        'offline_access'
      ].join(' ');

      // Microsoft OAuth 2.0 authorization endpoint
      const baseUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
      
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        response_mode: 'query',
        scope: scopes,
        state: state,
        prompt: 'consent'
      });

      const authUrl = `${baseUrl}?${params.toString()}`;

      console.log('✅ Microsoft OAuth URL generated successfully');
      console.log('🔗 Auth URL:', authUrl);
      console.log('🔐 State:', state);

      return {
        authUrl,
        state
      };
    } catch (error) {
      console.log('❌ Error generating Microsoft OAuth URL:', error);
      throw new BadRequestException('Failed to generate Microsoft OAuth URL');
    }
  }

  /**
   * Exchange Microsoft authorization code for access token
   */
  async exchangeMicrosoftToken(userId: string, authCode: string): Promise<void> {
    try {
      console.log('🔄 Exchanging Microsoft authorization code for tokens...');
      console.log('👤 User ID:', userId);
      console.log('🔐 Auth Code:', authCode);

      const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID');
      const clientSecret = this.configService.get<string>('MICROSOFT_CLIENT_SECRET');
      const tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID');
      const redirectUri = this.configService.get<string>('MICROSOFT_REDIRECT_URI') || 'http://localhost:3000/connectors/microsoft/callback';

      if (!clientId || !clientSecret || !tenantId) {
        throw new BadRequestException('Microsoft OAuth credentials are not configured');
      }

      console.log('🔧 Configuration:');
      console.log('  - Client ID:', clientId);
      console.log('  - Tenant ID:', tenantId);
      console.log('  - Redirect URI:', redirectUri);
      console.log('  - Auth Code Length:', authCode.length);

      // Exchange code for token
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: authCode,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      console.log('📤 Making token exchange request to:', tokenUrl);
      console.log('📋 Request Parameters:', {
        client_id: clientId,
        code: authCode.substring(0, 20) + '...',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      const tokenData = await response.json();

      if (!response.ok) {
        console.error('❌ Token exchange failed:', tokenData);
        throw new BadRequestException(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
      }

      console.log('✅ Token exchange successful!');
      console.log('📋 Token Response:');
      console.log('  - Access Token:', tokenData.access_token ? 'Present ✅' : 'Missing ❌');
      console.log('  - Refresh Token:', tokenData.refresh_token ? 'Present ✅' : 'Missing ❌');
      console.log('  - Token Type:', tokenData.token_type);
      console.log('  - Expires In:', tokenData.expires_in, 'seconds');
      console.log('  - Scope:', tokenData.scope);

      // Calculate token expiration date
      const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
      
      // Get user profile from Microsoft Graph
      let userProfile: any = {};
      if (tokenData.access_token) {
        console.log('🧪 Testing access token with Graph API...');
        
        const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`
          }
        });

        if (graphResponse.ok) {
          userProfile = await graphResponse.json();
          console.log('✅ Graph API test successful!');
          console.log('👤 User Profile:', {
            id: userProfile.id,
            displayName: userProfile.displayName,
            mail: userProfile.mail,
            userPrincipalName: userProfile.userPrincipalName
          });
        } else {
          console.error('❌ Graph API test failed:', await graphResponse.text());
        }
      }

      // Convert userId to ObjectId
      const userObjectId = new Types.ObjectId(userId);

      // Save Microsoft credentials to database
      // Find any existing connector for this user (regardless of connector_name)
      const existingConnector = await this.connectorModel.findOne({ 
        userId: userObjectId
      });

      if (existingConnector) {
        // Only one calendar can be connected at a time
        // Clear all existing credentials and set only Microsoft
        existingConnector.connector_creds = {
          orange: null,
          ovh: null,
          microsoft: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            tokenType: tokenData.token_type || 'Bearer',
            expiresIn: tokenData.expires_in,
            scope: tokenData.scope || '',
            expiresAt: expiresAt,
            userPrincipalName: userProfile.userPrincipalName || '',
            displayName: userProfile.displayName || '',
            mail: userProfile.mail || '',
            microsoftUserId: userProfile.id || '',
            isActive: true,
            isValid: true,
            connectedAt: new Date()
          }
        };

        // Update connector_name to 'microsoft'
        existingConnector.connector_name = 'microsoft';

        await existingConnector.save();
        console.log('✅ Updated existing connector with Microsoft credentials');
      } else {
        // Create new connector document for this user
        const newConnector = new this.connectorModel({
          userId: userObjectId,
          connector_name: 'microsoft',
          connector_creds: {
            orange: null,
            ovh: null,
            microsoft: {
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              tokenType: tokenData.token_type || 'Bearer',
              expiresIn: tokenData.expires_in,
              scope: tokenData.scope || '',
              expiresAt: expiresAt,
              userPrincipalName: userProfile.userPrincipalName || '',
              displayName: userProfile.displayName || '',
              mail: userProfile.mail || '',
              microsoftUserId: userProfile.id || '',
              isActive: true,
              isValid: true,
              connectedAt: new Date()
            }
          }
        });

        await newConnector.save();
        console.log('✅ Created new connector document with Microsoft credentials');
      }

      console.log('💾 Microsoft credentials saved successfully to database');

    } catch (error) {
      console.error('❌ Error exchanging Microsoft token:', error);
      throw error;
    }
  }

  /**
   * Get user's Microsoft calendar connection status
   * @param userId - User ID
   * @returns Microsoft connector if exists
   */
  async getMicrosoftConnector(userId: string): Promise<Connector | null> {
    const userObjectId = new Types.ObjectId(userId);
    
    const connector = await this.connectorModel
      .findOne({ 
        userId: userObjectId
      })
      .populate('userId', 'firstName lastName email domainName')
      .exec();

    return connector;
  }

  /**
   * Disconnect Microsoft calendar
   * @param userId - User ID
   * @returns Success confirmation
   */
  async disconnectMicrosoftCalendar(userId: string): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    
    const connector = await this.connectorModel.findOne({ 
      userId: userObjectId
    });

    if (!connector) {
      throw new NotFoundException('Connector not found for this user');
    }

    // Clear the microsoft credentials and set connector_name to 'none'
    if (connector.connector_creds) {
      connector.connector_creds.microsoft = null;
      connector.connector_name = 'none';
      await connector.save();
    }
  }

  /**
   * Get all connectors for a user
   * @param userId - User ID
   * @returns User's connector document with all provider credentials
   */
  async getUserConnectors(userId: string): Promise<Connector | null> {
    const userObjectId = new Types.ObjectId(userId);
    
    const connector = await this.connectorModel
      .findOne({ 
        userId: userObjectId
      })
      .populate('userId', 'firstName lastName email domainName')
      .exec();

    return connector;
  }

  /**
   * Get currently connected calendar provider for a user
   * @param userId - User ID
   * @returns Currently connected provider name or 'none'
   */
  async getConnectedProvider(userId: string): Promise<string> {
    const userObjectId = new Types.ObjectId(userId);
    
    const connector = await this.connectorModel.findOne({ 
      userId: userObjectId
    });

    if (!connector || connector.connector_name === 'none') {
      return 'none';
    }

    // Double-check that the claimed provider actually has credentials
    const creds = connector.connector_creds;
    
    if (connector.connector_name === 'orange' && creds?.orange?.isActive) {
      return 'orange';
    } else if (connector.connector_name === 'microsoft' && creds?.microsoft?.isActive) {
      return 'microsoft';
    } else if (connector.connector_name === 'ovh' && creds?.ovh) {
      return 'ovh';
    }
    
    // If connector_name doesn't match actual credentials, return 'none'
    return 'none';
  }

  /**
   * Get Microsoft access token for Graph API operations
   * @param userId - User ID
   * @returns Promise<string | null> - Access token if valid and not expired
   */
  async getMicrosoftAccessToken(userId: string): Promise<string | null> {
    try {
      console.log('🔍 Getting Microsoft access token for user:', userId);
      const connector = await this.getMicrosoftConnector(userId);
      
      if (!connector) {
        console.log('❌ No connector found for user:', userId);
        return null;
      }

      if (!connector.connector_creds?.microsoft) {
        console.log('❌ No Microsoft credentials found in connector');
        return null;
      }

      if (!connector.connector_creds.microsoft.accessToken) {
        console.log('❌ No access token found in Microsoft credentials');
        return null;
      }

      const microsoft = connector.connector_creds.microsoft;
      
      console.log('🔍 Microsoft token info:', {
        hasAccessToken: !!microsoft.accessToken,
        hasRefreshToken: !!microsoft.refreshToken,
        scope: microsoft.scope,
        isValid: microsoft.isValid,
        isActive: microsoft.isActive,
        expiresAt: microsoft.expiresAt,
        now: new Date(),
        timeUntilExpiry: new Date(microsoft.expiresAt).getTime() - Date.now()
      });
      
      // Check if token is still valid and not expired
      if (!microsoft.isValid || !microsoft.isActive) {
        console.log('❌ Microsoft token is not valid or not active');
        return null;
      }

      // Check if token is expired (with 5 minute buffer)
      const now = new Date();
      const expiresAt = new Date(microsoft.expiresAt);
      const bufferTime = 5 * 60 * 1000; // 5 minutes
      
      if (now.getTime() > (expiresAt.getTime() - bufferTime)) {
        console.log('🔄 Microsoft token expired, attempting refresh...');
        const refreshed = await this.refreshMicrosoftToken(userId);
        
        if (!refreshed) {
          console.log('❌ Failed to refresh Microsoft token');
          return null;
        }
        
        // Get the refreshed connector
        const refreshedConnector = await this.getMicrosoftConnector(userId);
        const newToken = refreshedConnector?.connector_creds?.microsoft?.accessToken || null;
        console.log('✅ Token refreshed successfully:', !!newToken);
        return newToken;
      }

      console.log('✅ Using existing valid Microsoft token');

      // Decode and check token scopes for debugging
      try {
        const tokenParts = microsoft.accessToken.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          console.log('🔍 Token payload scopes:', payload.scp || payload.scopes || 'No scopes found');
        }
      } catch (error) {
        console.log('🔍 Could not decode token payload:', error.message);
      }

      return microsoft.accessToken;
    } catch (error) {
      console.error('❌ Error getting Microsoft access token:', error);
      return null;
    }
  }

  /**
   * Refresh Microsoft access token using refresh token
   * @param userId - User ID
   * @returns Promise<boolean> - Success status
   */
  async refreshMicrosoftToken(userId: string): Promise<boolean> {
    try {
      const connector = await this.getMicrosoftConnector(userId);
      
      if (!connector?.connector_creds?.microsoft?.refreshToken) {
        throw new NotFoundException('Microsoft connector not found or missing refresh token');
      }

      const clientId = this.configService.get<string>('MICROSOFT_CLIENT_ID');
      const clientSecret = this.configService.get<string>('MICROSOFT_CLIENT_SECRET');
      const tenantId = this.configService.get<string>('MICROSOFT_TENANT_ID');

      if (!clientId || !clientSecret || !tenantId) {
        throw new BadRequestException('Microsoft OAuth credentials are not configured');
      }

      // Use refresh token directly (no decryption needed for Microsoft tokens)
      const refreshToken = connector.connector_creds.microsoft.refreshToken;

      // Exchange refresh token for new access token
      const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
      
      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: connector.connector_creds.microsoft.scope
      });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      const tokenData = await response.json();

      if (!response.ok) {
        console.error('❌ Token refresh failed:', tokenData);
        // Mark connector as invalid
        connector.connector_creds.microsoft.isValid = false;
        await connector.save();
        return false;
      }

      // Update tokens in database (no encryption for Microsoft tokens)
      const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
      const newAccessToken = tokenData.access_token;
      const newRefreshToken = tokenData.refresh_token 
        ? tokenData.refresh_token
        : connector.connector_creds.microsoft.refreshToken; // Keep old refresh token if new one not provided

      connector.connector_creds.microsoft.accessToken = newAccessToken;
      connector.connector_creds.microsoft.refreshToken = newRefreshToken;
      connector.connector_creds.microsoft.expiresIn = tokenData.expires_in;
      connector.connector_creds.microsoft.expiresAt = newExpiresAt;
      connector.connector_creds.microsoft.isValid = true;

      await connector.save();

      console.log('✅ Microsoft token refreshed successfully');
      return true;
    } catch (error) {
      console.error('❌ Error refreshing Microsoft token:', error);
      return false;
    }
  }
}
