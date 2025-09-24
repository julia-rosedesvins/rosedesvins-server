import { Controller, Post, Get, Body, Query, UseGuards, HttpStatus, HttpException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SubscriptionService, CreateOrUpdateSubscriptionServiceDto, GetAllSubscriptionsQueryDto } from './subscription.service';
import { AdminGuard } from '../guards/admin.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import {
  CreateOrUpdateSubscriptionSchema,
  CreateOrUpdateSubscriptionDto,
  GetAllSubscriptionsSchema,
  GetAllSubscriptionsDto
} from '../validators/subscription.validators';

@ApiTags('Subscription')
@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Post('create-or-update')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update user subscription (Admin only)' })
  @ApiBody({
    description: 'Subscription details to create or update',
    schema: {
      type: 'object',
      properties: {
        userId: { 
          type: 'string', 
          example: '60d5ecb74b24c72b8c8b4567',
          description: 'MongoDB ObjectId of the user'
        },
        startDate: { 
          type: 'string', 
          format: 'date-time',
          example: '2024-01-01T00:00:00.000Z',
          description: 'Subscription start date in ISO 8601 format'
        },
        endDate: { 
          type: 'string', 
          format: 'date-time',
          example: '2024-12-31T23:59:59.999Z',
          description: 'Subscription end date in ISO 8601 format'
        },
        notes: { 
          type: 'string', 
          example: 'Annual subscription for premium features',
          description: 'Optional admin notes about the subscription',
          maxLength: 500
        }
      },
      required: ['userId', 'startDate', 'endDate']
    }
  })
  async createOrUpdateSubscription(
    @CurrentAdmin() admin: any,
    @Body(new ZodValidationPipe(CreateOrUpdateSubscriptionSchema)) subscriptionDto: CreateOrUpdateSubscriptionDto
  ) {
    try {
      const subscriptionData: CreateOrUpdateSubscriptionServiceDto = {
        userId: subscriptionDto.userId,
        startDate: new Date(subscriptionDto.startDate),
        endDate: new Date(subscriptionDto.endDate),
        notes: subscriptionDto.notes,
        isActive: subscriptionDto.isActive
      };

      const result = await this.subscriptionService.createOrUpdateSubscription(admin.sub, subscriptionData);

      return {
        success: true,
        message: result.isNew 
          ? 'Subscription created successfully' 
          : 'Subscription updated successfully',
        data: {
          subscription: result.subscription,
          isNew: result.isNew
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: 'Failed to create/update subscription',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('admin/all')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all subscriptions with pagination and filters (Admin only)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of items per page (default: 10, max: 100)',
    example: 10
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive'],
    description: 'Filter by subscription status'
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    type: String,
    description: 'Filter by specific user ID',
    example: '60d5ecb74b24c72b8c8b4567'
  })
  async getAllSubscriptions(
    @CurrentAdmin() admin: any,
    @Query(new ZodValidationPipe(GetAllSubscriptionsSchema)) queryDto: GetAllSubscriptionsDto
  ) {
    try {
      const queryParams: GetAllSubscriptionsQueryDto = {
        page: queryDto.page || 1,
        limit: queryDto.limit || 10,
        status: queryDto.status,
        userId: queryDto.userId
      };

      const result = await this.subscriptionService.getAllSubscriptions(queryParams);

      return {
        success: true,
        message: 'Subscriptions retrieved successfully',
        data: result
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve subscriptions',
          error: error.message
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
