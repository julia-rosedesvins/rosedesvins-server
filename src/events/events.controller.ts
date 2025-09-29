import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
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
}
