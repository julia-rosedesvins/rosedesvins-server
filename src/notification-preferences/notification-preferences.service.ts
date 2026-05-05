import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { NotificationPreferences, NotificationPreferencesDocument } from '../schemas/notification-preferences.schema';
import { CreateOrUpdateNotificationPreferencesDto } from '../validators/notification-preferences.validators';
import { User } from '../schemas/user.schema';

@Injectable()
export class NotificationPreferencesService {
  constructor(
    @InjectModel(NotificationPreferences.name)
    private notificationPreferencesModel: Model<NotificationPreferencesDocument>,
    @InjectModel(User.name)
    private userModel: Model<User>,
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

  /**
   * Get notification preferences for a user
   * @param userId - The user ID
   * @returns Notification preferences document or null if not found
   */
  async getNotificationPreferences(
    userId: string,
  ): Promise<NotificationPreferencesDocument | null> {
    try {
      const notificationPreferences = await this.notificationPreferencesModel
        .findOne({ userId })
        .exec();

      return notificationPreferences;
    } catch (error) {
      console.error('Error in getNotificationPreferences:', error);
      throw error;
    }
  }

  /**
   * Get all users with their bookingAdvanceLimit
   * @returns Array of { email, bookingAdvanceLimit }
   */
  async getAllBookingAdvanceLimits(): Promise<{ email: string; bookingAdvanceLimit: string }[]> {
    try {
      const preferences = await this.notificationPreferencesModel
        .find({}, { userId: 1, bookingAdvanceLimit: 1 })
        .lean()
        .exec();

      const userIds = preferences.map((p) => p.userId);
      const users = await this.userModel
        .find({ _id: { $in: userIds } }, { _id: 1, email: 1, domainName: 1 })
        .lean()
        .exec();

      const userMap = new Map(users.map((u) => [u._id.toString(), { email: u.email, domainName: u.domainName }]));

      return preferences.map((p) => ({
        email: userMap.get(p.userId.toString())?.email || 'Unknown',
        domainName: userMap.get(p.userId.toString())?.domainName || 'Unknown',
        bookingAdvanceLimit: p.bookingAdvanceLimit,
      }));
    } catch (error) {
      console.error('Error in getAllBookingAdvanceLimits:', error);
      throw error;
    }
  }

  
}
