import { Controller, Post, Get, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Manually trigger notification check (for testing)
   */
  @Post('check')
  @ApiOperation({
    summary: 'Manual notification check',
    description: 'Manually trigger notification check for all upcoming booking events'
  })
  async manualNotificationCheck() {
    try {
      this.logger.log('🧪 Manual notification check triggered');
      await this.notificationsService.checkAndSendNotifications();
      return {
        success: true,
        message: 'Notification check completed'
      };
    } catch (error) {
      this.logger.error('Error in manual notification check:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Test notification for specific event
   */
  @Post('test/:eventId')
  @ApiOperation({
    summary: 'Test notification for specific event',
    description: 'Test notification system for a specific event ID'
  })
  async testEventNotification(@Param('eventId') eventId: string) {
    try {
      this.logger.log(`🧪 Testing notification for event: ${eventId}`);
      await this.notificationsService.testNotificationForEvent(eventId);
      return {
        success: true,
        message: `Notification test completed for event ${eventId}`
      };
    } catch (error) {
      this.logger.error(`Error testing notification for event ${eventId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get notification status
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get notification system status',
    description: 'Get current status and configuration of the notification system'
  })
  async getNotificationStatus() {
    return {
      success: true,
      message: 'Notification service is running',
      cronSchedule: 'Every 30 minutes',
      features: [
        'Customer notifications',
        'Provider notifications', 
        'Dynamic timing based on preferences',
        'Only for booking events'
      ],
      notificationOptions: {
        '1_hour': 'Send 1 hour before event',
        '2_hours': 'Send 2 hours before event',
        'day_before': 'Send 24 hours before event',
        'last_minute': 'Send 5 minutes before event',
        'never': 'Never send notifications'
      }
    };
  }
}
