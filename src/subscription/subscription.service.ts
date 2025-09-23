import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription } from '../schemas/subscriptions.schema';
import { User, UserRole, AccountStatus } from '../schemas/user.schema';

export interface CreateOrUpdateSubscriptionServiceDto {
  userId: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
}

export interface GetAllSubscriptionsQueryDto {
  page?: number;
  limit?: number;
  status?: string;
  userId?: string;
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async createOrUpdateSubscription(adminId: string, subscriptionDto: CreateOrUpdateSubscriptionServiceDto): Promise<{
    subscription: Subscription;
    isNew: boolean;
  }> {
    // Convert userId to ObjectId
    const userObjectId = new Types.ObjectId(subscriptionDto.userId);
    
    const user = await this.userModel.findOne({
      _id: userObjectId,
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] }
    });

    if (!user) {
      throw new NotFoundException('User not found or not eligible for subscription');
    }

    // Validate dates
    if (new Date(subscriptionDto.endDate) <= new Date(subscriptionDto.startDate)) {
      throw new BadRequestException('End date must be after start date');
    }

    // Check if user already has a subscription
    const existingSubscription = await this.subscriptionModel.findOne({
      userId: userObjectId
    });

    if (existingSubscription) {
      // Update existing subscription
      const updatedSubscription = await this.subscriptionModel.findByIdAndUpdate(
        existingSubscription._id,
        {
          startDate: subscriptionDto.startDate,
          endDate: subscriptionDto.endDate,
          notes: subscriptionDto.notes,
          adminId: adminId,
          isActive: true,
          cancelledById: null,
          cancelledAt: null
        },
        { new: true }
      ).populate('userId', 'firstName lastName email domainName')
       .populate('adminId', 'firstName lastName email')
       .exec();

      if (!updatedSubscription) {
        throw new NotFoundException('Failed to update subscription');
      }

      return {
        subscription: updatedSubscription,
        isNew: false
      };
    } else {
      // Create new subscription
      const newSubscription = new this.subscriptionModel({
        userId: userObjectId,
        adminId: adminId,
        startDate: subscriptionDto.startDate,
        endDate: subscriptionDto.endDate,
        notes: subscriptionDto.notes,
        isActive: true
      });

      const savedSubscription = await newSubscription.save();
      
      const populatedSubscription = await this.subscriptionModel
        .findById(savedSubscription._id)
        .populate('userId', 'firstName lastName email domainName')
        .populate('adminId', 'firstName lastName email')
        .exec();

      if (!populatedSubscription) {
        throw new NotFoundException('Failed to retrieve created subscription');
      }

      return {
        subscription: populatedSubscription,
        isNew: true
      };
    }
  }

  async getAllSubscriptions(queryDto: GetAllSubscriptionsQueryDto): Promise<{
    subscriptions: Subscription[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 10, status, userId } = queryDto;
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (status) filter.isActive = status === 'active';
    if (userId) filter.userId = new Types.ObjectId(userId);

    const [subscriptions, total] = await Promise.all([
      this.subscriptionModel
        .find(filter)
        .populate('userId', 'firstName lastName email domainName phoneNumber')
        .populate('adminId', 'firstName lastName email')
        .populate('cancelledById', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.subscriptionModel.countDocuments(filter)
    ]);

    return {
      subscriptions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }
}
