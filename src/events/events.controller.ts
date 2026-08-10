import { Controller, Get, Post, UseGuards, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { UserGuard } from '../guards/user.guard';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('my-events')
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Get all events for current user',
    description: 'Retrieve all events (bookings, personal, external, blocked) for the authenticated user. Events are sorted by date and time.'
  })
  @ApiBearerAuth('user-token')
  async getUserEvents(@CurrentUser() currentUser: any) {
    try {
      const events = await this.eventsService.getUserEvents(currentUser.sub);
      
      return {
        success: true,
        message: 'Events retrieved successfully',
        data: events,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('public/user/:userId/schedule')
  @ApiOperation({ 
    summary: 'Get public user schedule',
    description: 'Public endpoint to get user event dates and times only. No authentication required. Only returns eventDate and eventTime for active events.'
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID to get schedule for',
    type: 'string'
  })
  async getPublicUserSchedule(@Param('userId') userId: string) {
    try {
      const schedule = await this.eventsService.getPublicUserSchedule(userId);
      
      return {
        success: true,
        message: 'User schedule retrieved successfully',
        data: schedule,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('sync')
  @ApiOperation({ 
    summary: 'Sync events from calendar connectors (GET)',
    description: 'Public GET endpoint to sync events from all active calendar connectors (Orange, OVH, Microsoft) to the events table. Prevents duplicate events by checking external event IDs.'
  })
  async syncEventsFromConnectorsGet() {
    try {
      const syncResult = await this.eventsService.syncEventsFromConnectors();
      
      return syncResult;
    } catch (error) {
      throw error;
    }
  }

  @Post('sync/user')
  @ApiOperation({
    summary: 'Sync events for a single user by email (Public)',
    description:
      'Public endpoint. Syncs calendar events only for connectors belonging to the user with the given email. Uses the same sync logic as GET /events/sync.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
      },
    },
  })
  async syncEventsForUserByEmail(@Body() body: { email: string }) {
    try {
      return await this.eventsService.syncEventsForUserByEmail(body.email);
    } catch (error) {
      throw error;
    }
  }

  @Post('connector/fetch')
  @ApiOperation({
    summary: 'Fetch connector calendar events for a user by email (no DB write)',
    description:
      'Public endpoint. Given a user email, looks up their linked connector (orange/microsoft/google) and fetches events directly from that provider. Data is returned as-is and is NOT saved to the database.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
      },
    },
  })
  async fetchConnectorEventsForUserByEmail(@Body() body: { email: string }) {
    try {
      return await this.eventsService.fetchConnectorEventsForUserByEmail(body.email);
    } catch (error) {
      throw error;
    }
  }
}

