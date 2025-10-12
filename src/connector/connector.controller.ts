import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { ApiTags, ApiResponse, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { UserGuard } from '../guards/user.guard';
import { ConnectorService } from './connector.service';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { OrangeConnectorSchema, OrangeConnectorDto } from '../validators/connector.validators';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('Calendar Connectors')
@Controller('connectors')
export class ConnectorController {
  constructor(private readonly connectorService: ConnectorService) {}

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
}
