import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationPreferences, NotificationPreferencesDocument } from '../schemas/notification-preferences.schema';
import { CreateOrUpdateNotificationPreferencesDto } from '../validators/notification-preferences.validators';

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectModel(NotificationPreferences.name)
    private notificationPreferencesModel: Model<NotificationPreferencesDocument>,
  ) {}

  /**
   * Create or update notification preferences for a user
   * @param userId - The user ID
   * @param updateData - Notification preferences data to create or update
   * @returns Updated or created notification preferences
   */
  async createOrUpdateNotificationPreferences(
    userId: string,
    updateData: CreateOrUpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesDocument> {
    try {
        console.log('Creating or updating notification preferences for userId:', userId);
      // Use findOneAndUpdate with upsert: true to create if not exists, update if exists
      const notificationPreferences = await this.notificationPreferencesModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            ...updateData,
            userId, // Ensure userId is set
          }
        },
        {
          new: true, // Return the updated document
          upsert: true, // Create if document doesn't exist
          runValidators: true, // Run schema validators
        }
      ).exec();

      return notificationPreferences;
    } catch (error) {
      console.error('Error in createOrUpdateNotificationPreferences:', error);
      throw error;
    }
  }
}
