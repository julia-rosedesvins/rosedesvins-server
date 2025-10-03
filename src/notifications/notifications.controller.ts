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
   * Send test notification emails for specific event
   */
  @Post('send-test-emails/:eventId')
  @ApiOperation({
    summary: 'Send test notification emails',
    description: 'Send actual test notification emails (both customer and provider) for a specific event ID'
  })
  async sendTestEmails(@Param('eventId') eventId: string) {
    try {
      this.logger.log(`📧 Sending test notification emails for event: ${eventId}`);
      const result = await this.notificationsService.sendTestNotificationEmails(eventId);
      return {
        success: true,
        message: `Test notification emails sent successfully for event ${eventId}`,
        details: result
      };
    } catch (error) {
      this.logger.error(`Error sending test notification emails for event ${eventId}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Send quick test emails with mock data
   */
  @Post('send-quick-test/:email')
  @ApiOperation({
    summary: 'Send quick test emails with mock data',
    description: 'Send test notification emails using mock event data to specified email address'
  })
  async sendQuickTestEmails(@Param('email') email: string) {
    try {
      this.logger.log(`📧 Sending quick test notification emails to: ${email}`);
      const result = await this.notificationsService.sendQuickTestEmails(email);
      return {
        success: true,
        message: `Quick test notification emails sent successfully to ${email}`,
        details: result
      };
    } catch (error) {
      this.logger.error(`Error sending quick test emails to ${email}:`, error);
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
