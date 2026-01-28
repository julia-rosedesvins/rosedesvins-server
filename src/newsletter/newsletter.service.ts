import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { NewsletterSubscription, SubscriptionStatus } from '../schemas/newsletter-subscription.schema';
import { User, UserRole, AccountStatus } from '../schemas/user.schema';
import { Subscription } from '../schemas/subscriptions.schema';
import { EmailService } from '../email/email.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { ApproveSubscriptionDto } from './dto/approve-subscription.dto';
import { RejectSubscriptionDto } from './dto/reject-subscription.dto';

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedSubscriptionsResponse {
  subscriptions: NewsletterSubscription[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalSubscriptions: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

@Injectable()
export class NewsletterService {
  private readonly logger = new Logger(NewsletterService.name);

  constructor(
    @InjectModel(NewsletterSubscription.name) private newsletterSubscriptionModel: Model<NewsletterSubscription>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
    private emailService: EmailService,
  ) {}

  async subscribe(subscribeDto: SubscribeDto): Promise<NewsletterSubscription> {
    const { email } = subscribeDto;

    // Check if subscription already exists
    const existing = await this.newsletterSubscriptionModel.findOne({ 
      email: email.toLowerCase() 
    });

    if (existing) {
      if (existing.status === SubscriptionStatus.PENDING) {
        throw new BadRequestException('Cette adresse email est déjà en attente d\'approbation');
      }
      if (existing.status === SubscriptionStatus.APPROVED) {
        throw new BadRequestException('Cette adresse email est déjà inscrite');
      }
      if (existing.status === SubscriptionStatus.REJECTED) {
        // Allow resubscription if previously rejected
        existing.status = SubscriptionStatus.PENDING;
        existing.rejectedBy = null;
        existing.rejectedAt = null;
        existing.rejectionReason = null;
        return await existing.save();
      }
    }

    // Check if user already exists
    const existingUser = await this.userModel.findOne({ 
      email: email.toLowerCase() 
    });

    if (existingUser) {
      throw new BadRequestException('Un compte existe déjà avec cette adresse email');
    }

    // Create new subscription
    const subscription = new this.newsletterSubscriptionModel({
      email: email.toLowerCase(),
      status: SubscriptionStatus.PENDING,
    });

    const saved = await subscription.save();

    // Send notification to admin
    try {
      await this.emailService.sendNewSubscriptionNotification(email);
    } catch (error) {
      console.error('Failed to send admin notification:', error);
    }

    return saved;
  }

  async getPendingSubscriptions(query: PaginationQuery): Promise<PaginatedSubscriptionsResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const totalSubscriptions = await this.newsletterSubscriptionModel.countDocuments({
      status: SubscriptionStatus.PENDING,
    });

    const subscriptions = await this.newsletterSubscriptionModel
      .find({ status: SubscriptionStatus.PENDING })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalSubscriptions / limit);

    return {
      subscriptions: subscriptions as NewsletterSubscription[],
      pagination: {
        currentPage: page,
        totalPages,
        totalSubscriptions,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getApprovedSubscriptions(query: PaginationQuery): Promise<PaginatedSubscriptionsResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const totalSubscriptions = await this.newsletterSubscriptionModel.countDocuments({
      status: SubscriptionStatus.APPROVED,
    });

    const subscriptions = await this.newsletterSubscriptionModel
      .find({ status: SubscriptionStatus.APPROVED })
      .sort({ approvedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalSubscriptions / limit);

    return {
      subscriptions: subscriptions as NewsletterSubscription[],
      pagination: {
        currentPage: page,
        totalPages,
        totalSubscriptions,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getRejectedSubscriptions(query: PaginationQuery): Promise<PaginatedSubscriptionsResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10));
    const skip = (page - 1) * limit;

    const totalSubscriptions = await this.newsletterSubscriptionModel.countDocuments({
      status: SubscriptionStatus.REJECTED,
    });

    const subscriptions = await this.newsletterSubscriptionModel
      .find({ status: SubscriptionStatus.REJECTED })
      .sort({ rejectedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalSubscriptions / limit);

    return {
      subscriptions: subscriptions as NewsletterSubscription[],
      pagination: {
        currentPage: page,
        totalPages,
        totalSubscriptions,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async approveAndCreateUser(
    approveDto: ApproveSubscriptionDto,
    adminId: string,
  ): Promise<{ subscription: NewsletterSubscription; user: User }> {
    const { subscriptionId, firstName, lastName, domainName } = approveDto;

    // Find subscription
    const subscription = await this.newsletterSubscriptionModel.findOne({
      _id: subscriptionId,
      status: SubscriptionStatus.PENDING,
    });

    if (!subscription) {
      throw new NotFoundException('Souscription non trouvée ou déjà traitée');
    }

    // Check if user with this email already exists
    const existingUser = await this.userModel.findOne({ 
      email: subscription.email 
    });

    if (existingUser) {
      throw new BadRequestException('Un utilisateur avec cet email existe déjà');
    }

    // Generate random password
    const tempPassword = this.generateRandomPassword();
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(tempPassword, saltRounds);

    // Create user account
    const user = new this.userModel({
      firstName,
      lastName,
      email: subscription.email,
      password: hashedPassword,
      domainName,
      role: UserRole.USER,
      accountStatus: AccountStatus.APPROVED,
      mustChangePassword: true,
      submittedAt: new Date(),
      approvedBy: adminId,
      approvedAt: new Date(),
    });

    const savedUser = await user.save();

    // Create default subscription for 1 month
    try {
      const currentDate = new Date();
      const endDate = new Date(currentDate);
      endDate.setMonth(currentDate.getMonth() + 1); // Add 1 month

      const userSubscription = new this.subscriptionModel({
        userId: savedUser._id,
        adminId: new Types.ObjectId(adminId),
        startDate: currentDate,
        endDate: endDate,
        isActive: true,
        notes: 'Default subscription created on approval',
      });

      await userSubscription.save();
      this.logger.log(`Created default 1-month subscription for user ${savedUser.email}`);
    } catch (subscriptionError) {
      this.logger.error('Failed to create default subscription:', subscriptionError);
      // Don't fail the approval process if subscription creation fails
    }

    // Update newsletter subscription status
    subscription.status = SubscriptionStatus.APPROVED;
    subscription.approvedBy = adminId;
    subscription.approvedAt = new Date();
    subscription.createdUserId = (savedUser._id as any).toString();
    await subscription.save();

    // Send welcome email with login credentials
    try {
      await this.emailService.sendUserApprovalEmail(
        savedUser.email,
        savedUser.firstName,
        savedUser.lastName,
        tempPassword,
      );
    } catch (error) {
      console.error('Failed to send approval email:', error);
    }

    return { subscription, user: savedUser };
  }

  async rejectSubscription(
    rejectDto: RejectSubscriptionDto,
    adminId: string,
  ): Promise<NewsletterSubscription> {
    const { subscriptionId, rejectionReason } = rejectDto;

    const subscription = await this.newsletterSubscriptionModel.findOne({
      _id: subscriptionId,
      status: SubscriptionStatus.PENDING,
    });

    if (!subscription) {
      throw new NotFoundException('Souscription non trouvée ou déjà traitée');
    }

    subscription.status = SubscriptionStatus.REJECTED;
    subscription.rejectedBy = adminId;
    subscription.rejectedAt = new Date();
    subscription.rejectionReason = rejectionReason || null;

    const updated = await subscription.save();

    // Optionally send rejection email
    try {
      if (rejectionReason) {
        await this.emailService.sendSubscriptionRejectionEmail(
          subscription.email,
          rejectionReason,
        );
      }
    } catch (error) {
      console.error('Failed to send rejection email:', error);
    }

    return updated;
  }

  private generateRandomPassword(length: number = 12): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}
