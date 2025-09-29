import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Event } from '../schemas/events.schema';

@Injectable()
export class EventsService {
  constructor(
    @InjectModel(Event.name) private eventModel: Model<Event>,
  ) {}

  /**
   * Get all events for a specific user
   * @param userId - User ID to get events for
   * @returns Promise with user's events
   */
  async getUserEvents(userId: string): Promise<Event[]> {
    try {
      const userObjectId = new Types.ObjectId(userId);
      
      const events = await this.eventModel
        .find({ userId: userObjectId })
        .populate('bookingId', 'bookingDate bookingTime userContactFirstname userContactLastname bookingStatus') // Populate booking details if linked
        .sort({ eventDate: 1, eventTime: 1 }) // Sort by date and time ascending
        .lean()
        .exec();

      return events;
    } catch (error) {
      throw error;
    }
  }
}
