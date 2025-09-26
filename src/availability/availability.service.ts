import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Availability } from '../schemas/availability.schema';
import { User } from '../schemas/user.schema';
import { SaveAvailabilityDto } from '../validators/availability.validators';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectModel(Availability.name) private availabilityModel: Model<Availability>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  /**
   * Save or update user availability settings
   * @param saveAvailabilityDto - Availability data to save
   * @param userId - User ID from JWT token
   * @returns Saved availability settings
   */
  async saveAvailability(saveAvailabilityDto: SaveAvailabilityDto, userId: string): Promise<Availability> {
    const userObjectId = new Types.ObjectId(userId);

    // Verify user exists and is active
    const user = await this.userModel.findOne({
      _id: userObjectId,
      accountStatus: { $in: ['approved', 'active'] }
    });

    if (!user) {
      throw new NotFoundException('User not found or account not active');
    }

    // Validate time slots don't overlap within each day
    this.validateTimeSlots(saveAvailabilityDto.weeklyAvailability);

    // Validate special date overrides
    this.validateSpecialDateOverrides(saveAvailabilityDto.specialDateOverrides);

    // Check if availability settings already exist for this user
    const existingAvailability = await this.availabilityModel.findOne({ userId: userObjectId });

    if (existingAvailability) {
      // Update existing availability
      Object.assign(existingAvailability, {
        ...saveAvailabilityDto,
        userId: userObjectId,
        updatedAt: new Date(),
      });

      return await existingAvailability.save();
    } else {
      // Create new availability settings
      const newAvailability = new this.availabilityModel({
        ...saveAvailabilityDto,
        userId: userObjectId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return await newAvailability.save();
    }
  }

  /**
   * Get user availability settings
   * @param userId - User ID from JWT token
   * @returns User availability settings or null if not found
   */
  async getUserAvailability(userId: string): Promise<Availability | null> {
    const userObjectId = new Types.ObjectId(userId);

    // Verify user exists and is active
    const user = await this.userModel.findOne({
      _id: userObjectId,
      accountStatus: { $in: ['approved', 'active'] }
    });

    if (!user) {
      throw new NotFoundException('User not found or account not active');
    }

    // Get availability settings for the user
    const availability = await this.availabilityModel
      .findOne({ userId: userObjectId })
      .exec();

    return availability;
  }

  /**
   * Validate that time slots within a day don't overlap
   */
  private validateTimeSlots(weeklyAvailability: any): void {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    days.forEach(day => {
      const dayAvailability = weeklyAvailability[day];
      if (dayAvailability?.isAvailable && dayAvailability.timeSlots?.length > 1) {
        const slots = dayAvailability.timeSlots.sort((a: any, b: any) => {
          return a.startTime.localeCompare(b.startTime);
        });

        for (let i = 0; i < slots.length - 1; i++) {
          const currentEnd = this.timeToMinutes(slots[i].endTime);
          const nextStart = this.timeToMinutes(slots[i + 1].startTime);

          if (currentEnd > nextStart) {
            throw new BadRequestException(
              `Overlapping time slots found on ${day}: ${slots[i].startTime}-${slots[i].endTime} overlaps with ${slots[i + 1].startTime}-${slots[i + 1].endTime}`
            );
          }
        }
      }
    });
  }

  /**
   * Validate special date overrides
   */
  private validateSpecialDateOverrides(specialDateOverrides: any[]): void {
    const dateMap = new Map();

    specialDateOverrides.forEach((override, index) => {
      const dateStr = override.date.toISOString().split('T')[0];
      
      if (dateMap.has(dateStr)) {
        throw new BadRequestException(`Duplicate special date override found for ${dateStr}`);
      }
      
      dateMap.set(dateStr, true);

      // Validate time slots for available special dates
      if (override.isAvailable && override.timeSlots?.length > 1) {
        const slots = override.timeSlots.sort((a: any, b: any) => {
          return a.startTime.localeCompare(b.startTime);
        });

        for (let i = 0; i < slots.length - 1; i++) {
          const currentEnd = this.timeToMinutes(slots[i].endTime);
          const nextStart = this.timeToMinutes(slots[i + 1].startTime);

          if (currentEnd > nextStart) {
            throw new BadRequestException(
              `Overlapping time slots found in special date override ${dateStr}: ${slots[i].startTime}-${slots[i].endTime} overlaps with ${slots[i + 1].startTime}-${slots[i + 1].endTime}`
            );
          }
        }
      }
    });
  }

  /**
   * Convert time string (HH:mm) to minutes since midnight
   */
  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }
}
