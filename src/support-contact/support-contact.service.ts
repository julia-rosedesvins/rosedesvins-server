import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportContact } from '../schemas/support-contact.schema';
import { User } from '../schemas/user.schema';
import { CreateSupportContactDto, PaginationQueryDto } from '../validators/support-contact.validators';
import { EmailService } from '../email/email.service';

@Injectable()
export class SupportContactService {
  constructor(
    @InjectModel(SupportContact.name) private supportContactModel: Model<SupportContact>,
    @InjectModel(User.name) private userModel: Model<User>,
    private emailService: EmailService,
  ) {}

  async createSupportTicket(userId: string, createSupportContactDto: CreateSupportContactDto): Promise<SupportContact> {
    const userObjectId = new Types.ObjectId(userId);
    
    const supportContact = new this.supportContactModel({
      userId: userObjectId,
      subject: createSupportContactDto.subject,
      message: createSupportContactDto.message,
      status: 'pending',
    });

    const saved = await supportContact.save();

    // Send alert email to admin (non-blocking)
    try {
      const user = await this.userModel.findById(userObjectId).select('firstName lastName email domainName').exec();
      if (user) {
        await this.emailService.sendSupportTicketAlert({
          userFullName: `${user.firstName} ${user.lastName}`,
          userEmail: user.email,
          domainName: (user as any).domainName,
          subject: createSupportContactDto.subject,
          message: createSupportContactDto.message,
          ticketId: (saved._id as any).toString(),
        });
      }
    } catch (emailError) {
      // Do not fail ticket creation if email fails
      console.error('Failed to send support ticket alert email:', emailError);
    }

    return saved;
  }

  async getUnreadCount(): Promise<number> {
    return this.supportContactModel.countDocuments({ status: 'pending' }).exec();
  }

  async getUserSupportTickets(userId: string, query: PaginationQueryDto): Promise<{
    tickets: SupportContact[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalTickets: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const userObjectId = new Types.ObjectId(userId);
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalTickets = await this.supportContactModel.countDocuments({
      userId: userObjectId,
    });

    // Get paginated tickets
    const tickets = await this.supportContactModel
      .find({ userId: userObjectId })
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(totalTickets / limit);

    return {
      tickets,
      pagination: {
        currentPage: page,
        totalPages,
        totalTickets,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getAllSupportTickets(query: PaginationQueryDto): Promise<{
    tickets: SupportContact[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalTickets: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const { page = 1, limit = 10 } = query;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalTickets = await this.supportContactModel.countDocuments();

    // Get paginated tickets with user information
    const tickets = await this.supportContactModel
      .find()
      .populate('userId', 'firstName lastName email domainName')
      .sort({ createdAt: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .exec();

    const totalPages = Math.ceil(totalTickets / limit);

    return {
      tickets,
      pagination: {
        currentPage: page,
        totalPages,
        totalTickets,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async updateTicketStatus(ticketId: string, status: 'pending' | 'in-progress' | 'resolved' | 'closed'): Promise<SupportContact> {
    const ticketObjectId = new Types.ObjectId(ticketId);
    
    const updatedTicket = await this.supportContactModel
      .findByIdAndUpdate(
        ticketObjectId,
        { status, updatedAt: new Date() },
        { new: true }
      )
      .populate('userId', 'firstName lastName email domainName')
      .exec();

    if (!updatedTicket) {
      throw new Error('Support ticket not found');
    }

    return updatedTicket;
  }
}
