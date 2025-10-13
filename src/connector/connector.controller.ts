import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpStatus,
  HttpException,
  Redirect,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiResponse, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { UserGuard } from '../guards/user.guard';
import { ConnectorService } from './connector.service';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { OrangeConnectorSchema, OrangeConnectorDto } from '../validators/connector.validators';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('Calendar Connectors')
@Controller('connectors')
export class ConnectorController {
  constructor(
    private readonly connectorService: ConnectorService,
    private readonly configService: ConfigService
  ) {}

  @Post('orange/connect')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect Orange calendar' })
  @ApiBody({
    description: 'Orange calendar credentials',
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', minLength: 3, maxLength: 100 },
        password: { type: 'string', minLength: 1, maxLength: 255 }
      },
      required: ['username', 'password']
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Orange calendar connected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: { type: 'object' }
      }
    }
  })
  async connectOrangeCalendar(
    @Body(new ZodValidationPipe(OrangeConnectorSchema)) connectorData: OrangeConnectorDto,
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;
      const result = await this.connectorService.connectOrangeCalendar(userId, connectorData);

      return {
        success: true,
        message: 'Orange calendar connected successfully',
        data: result
      };
    } catch (error) {
      console.error('Error connecting Orange calendar:', error);
      if (error.name === 'ZodError') {
        throw new HttpException({
          success: false,
          message: 'Validation failed',
          errors: error.errors?.map(err => ({
            field: err.path?.join('.') || 'unknown',
            message: err.message,
            value: err.input
          })) || []
        }, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @Get('orange/status')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Orange calendar connection status' })
  @ApiResponse({
    status: 200,
    description: 'Orange calendar connection status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: { 
          anyOf: [
            { type: 'object' },
            { type: 'null' }
          ]
        }
      }
    }
  })
  async getOrangeConnectorStatus(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;

      const connector = await this.connectorService.getOrangeConnector(userId);

      return {
        success: true,
        message: connector 
          ? 'Orange calendar connection found'
          : 'No Orange calendar connection found',
        data: connector
      };
    } catch (error) {
      console.error('Error getting Orange connector status:', error);
      throw error;
    }
  }

  @Delete('orange/disconnect')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect Orange calendar' })
  @ApiResponse({
    status: 200,
    description: 'Orange calendar disconnected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  async disconnectOrangeCalendar(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const userId = user.sub;

      await this.connectorService.disconnectOrangeCalendar(userId);

      return {
        success: true,
        message: 'Orange calendar disconnected successfully'
      };
    } catch (error) {
      console.error('Error disconnecting Orange calendar:', error);
      throw error;
    }
  }

  @Get('connected-provider')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get currently connected calendar provider' })
  @ApiResponse({
    status: 200,
    description: 'Currently connected provider retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            provider: { type: 'string', enum: ['orange', 'microsoft', 'ovh', 'none'] }
          }
        }
      }
    }
  })
  async getConnectedProvider(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: { provider: string };
  }> {
    try {
      const userId = user.sub;
      const provider = await this.connectorService.getConnectedProvider(userId);

      return {
        success: true,
        message: `Currently connected provider: ${provider}`,
        data: { provider }
      };
    } catch (error) {
      console.error('Error getting connected provider:', error);
      throw error;
    }
  }

  @Get('microsoft/status')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Microsoft calendar connection status' })
  @ApiResponse({
    status: 200,
    description: 'Microsoft calendar connection status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          nullable: true,
          description: 'Connector data or null if not connected'
        }
      }
    }
  })
  async getMicrosoftCalendarStatus(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;
      const connector = await this.connectorService.getMicrosoftConnector(userId);

      return {
        success: true,
        message: connector 
          ? 'Microsoft calendar connection found'
          : 'No Microsoft calendar connection found',
        data: connector
      };
    } catch (error) {
      console.error('Error getting Microsoft connector status:', error);
      throw error;
    }
  }

  @Get('microsoft/oauth-url')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Microsoft OAuth URL for calendar permissions' })
  @ApiResponse({
    status: 200,
    description: 'Microsoft OAuth URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            authUrl: { type: 'string' },
            state: { type: 'string' }
          }
        }
      }
    }
  })
  async getMicrosoftOAuthUrl(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      authUrl: string;
      state: string;
    };
  }> {
    try {
      const userId = user.sub;
      const result = await this.connectorService.generateMicrosoftOAuthUrl(userId);

      return {
        success: true,
        message: 'Microsoft OAuth URL generated successfully',
        data: result
      };
    } catch (error) {
      console.error('Error generating Microsoft OAuth URL:', error);
      throw new HttpException({
        success: false,
        message: 'Failed to generate Microsoft OAuth URL',
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('microsoft/exchange-token')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Exchange Microsoft OAuth authorization code for access tokens',
    description: 'Exchange the authorization code received from Microsoft OAuth callback for access and refresh tokens. The tokens will be logged to console for debugging.'
  })
  @ApiBody({
    description: 'Authorization code received from Microsoft OAuth callback',
    schema: {
      type: 'object',
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description: 'The authorization code received from Microsoft OAuth callback',
          example: 'M.C123_BAY.2.U.12345678-abcd-efgh-ijkl-123456789012'
        }
      }
    }
  })
  @ApiResponse({
    status: 200,
    description: 'Microsoft token exchanged successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Microsoft token exchanged successfully, check console for details' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid authorization code',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Failed to exchange Microsoft token' },
        error: { type: 'string', example: 'Invalid authorization code' }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication token'
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Failed to exchange Microsoft token' },
        error: { type: 'string', example: 'Internal server error message' }
      }
    }
  })
  async exchangeMicrosoftToken(
    @Body('code') code: string,
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const userId = user.sub;
      await this.connectorService.exchangeMicrosoftToken(userId, code);

      return {
        success: true,
        message: 'Microsoft token exchanged successfully, check console for details'
      };
    } catch (error) {
      console.error('Error exchanging Microsoft token:', error);
      throw new HttpException({
        success: false,
        message: 'Failed to exchange Microsoft token',
        error: error.message
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('microsoft/callback')
  @ApiOperation({
    summary: 'Microsoft OAuth callback endpoint',
    description: 'Handles the OAuth redirect from Microsoft and automatically exchanges the authorization code for tokens'
  })
  @ApiResponse({
    status: 200,
    description: 'OAuth callback handled successfully - tokens saved to database',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Microsoft Calendar connected successfully' },
        data: {
          type: 'object',
          properties: {
            provider: { type: 'string', example: 'microsoft' },
            userId: { type: 'string', example: 'user123' },
            connected: { type: 'boolean', example: true },
            timestamp: { type: 'string', example: '2025-10-12T11:30:00.000Z' },
            redirectUrl: { type: 'string', example: 'http://localhost:3000/settings' }
          }
        }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'OAuth error or missing authorization code',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'OAuth callback failed' },
        error: { type: 'string', example: 'Error details' }
      }
    }
  })
  async handleMicrosoftCallback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string
  ): Promise<void> {
    try {
      // Handle OAuth error
      if (error) {
        console.error('❌ Microsoft OAuth Error:', error, errorDescription);
        const clientUrl = this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000';
        const errorRedirectUrl = `${clientUrl}/dashboard/settings?microsoft_error=${encodeURIComponent(errorDescription || error || 'OAuth failed')}`;
        res.redirect(errorRedirectUrl);
        return;
      }

      // Check for authorization code
      if (!code) {
        console.error('❌ No authorization code received');
        const clientUrl = this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000';
        const errorRedirectUrl = `${clientUrl}/dashboard/settings?microsoft_error=${encodeURIComponent('No authorization code received')}`;
        res.redirect(errorRedirectUrl);
        return;
      }

      console.log('🔄 Microsoft OAuth callback received');
      console.log('📋 Callback Data:', { code: code.substring(0, 20) + '...', state, hasError: !!error });

      // Extract userId from state (format: userId_timestamp_random)
      let userId = 'unknown';
      if (state) {
        const stateParts = state.split('_');
        if (stateParts.length >= 3) {
          userId = stateParts[0];
        }
      }

      // Automatically exchange the code for tokens
      await this.connectorService.exchangeMicrosoftToken(userId, code);

      // Get client URL for redirect
      const clientUrl = this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000';
      const redirectUrl = `${clientUrl}/dashboard/settings?microsoft_connected=true`;

      // Redirect immediately to the client with success parameter
      console.log('🔄 Redirecting user to:', redirectUrl);
      res.redirect(redirectUrl);

    } catch (error) {
      console.error('❌ Error in Microsoft OAuth callback:', error);
      
      const clientUrl = this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000';
      const errorRedirectUrl = `${clientUrl}/dashboard/settings?microsoft_error=${encodeURIComponent(error.message || 'Failed to connect Microsoft Calendar')}`;
      res.redirect(errorRedirectUrl);
    }
  }

  @Delete('microsoft/disconnect')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect Microsoft calendar' })
  @ApiResponse({
    status: 200,
    description: 'Microsoft calendar disconnected successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  })
  async disconnectMicrosoftCalendar(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const userId = user.sub;

      await this.connectorService.disconnectMicrosoftCalendar(userId);

      return {
        success: true,
        message: 'Microsoft calendar disconnected successfully'
      };
    } catch (error) {
      console.error('Error disconnecting Microsoft calendar:', error);
      throw error;
    }
  }
}
