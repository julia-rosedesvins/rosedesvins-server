import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationPreferencesService } from './notification-preferences.service';
import { UserGuard } from '../guards/user.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  CreateOrUpdateNotificationPreferencesSchema,
  CreateOrUpdateNotificationPreferencesDto
} from '../validators/notification-preferences.validators';
import { NOTIFICATION_OPTIONS, NOTIFICATION_OPTION_LABELS } from '../schemas/notification-preferences.schema';

@ApiTags('Notification Preferences')
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(private readonly notificationPreferencesService: NotificationPreferencesService) {}

  @Post('create-or-update')
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Create or update notification preferences',
    description: 'Creates new notification preferences or updates existing ones for the current user'
  })
  @ApiBearerAuth('user-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        customerNotificationBefore: { 
          type: 'string', 
          enum: Object.values(NOTIFICATION_OPTIONS),
          example: NOTIFICATION_OPTIONS.DAY_BEFORE,
          description: 'How long before the booking starts to notify the customer'
        },
        providerNotificationBefore: { 
          type: 'string', 
          enum: Object.values(NOTIFICATION_OPTIONS),
          example: NOTIFICATION_OPTIONS.TWO_HOURS,
          description: 'How long before the booking starts to notify you (service provider)'
        },
        bookingAdvanceLimit: { 
          type: 'string', 
          enum: Object.values(NOTIFICATION_OPTIONS),
          example: NOTIFICATION_OPTIONS.DAY_BEFORE,
          description: 'How far in advance of a tour start can a customer book'
        },
        emailNotificationsEnabled: { 
          type: 'boolean', 
          example: true,
          description: 'Enable email notifications'
        },
        smsNotificationsEnabled: { 
          type: 'boolean', 
          example: true,
          description: 'Enable SMS notifications'
        },
        pushNotificationsEnabled: { 
          type: 'boolean', 
          example: true,
          description: 'Enable push notifications'
        }
      },
      additionalProperties: false
    }
  })
  async createOrUpdateNotificationPreferences(
    @Body(
      new ZodValidationPipe(CreateOrUpdateNotificationPreferencesSchema)
    ) createOrUpdateDto: CreateOrUpdateNotificationPreferencesDto,
    @CurrentUser() currentUser: any,
  ) {
    try {      
      const notificationPreferences = await this.notificationPreferencesService
        .createOrUpdateNotificationPreferences(currentUser.sub, createOrUpdateDto);

      // Transform the response to include human-readable labels
      const responseData = {
        ...notificationPreferences.toObject(),
        // Add human-readable labels for frontend display
        labels: {
          customerNotificationBefore: NOTIFICATION_OPTION_LABELS[notificationPreferences.customerNotificationBefore],
          providerNotificationBefore: NOTIFICATION_OPTION_LABELS[notificationPreferences.providerNotificationBefore],
          bookingAdvanceLimit: NOTIFICATION_OPTION_LABELS[notificationPreferences.bookingAdvanceLimit],
        }
      };

      return {
        success: true,
        message: 'Notification preferences saved successfully',
        data: responseData,
      };
    } catch (error) {
      throw error;
    }
  }
}
