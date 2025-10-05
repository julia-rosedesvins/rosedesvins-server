import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SupportContact } from '../schemas/support-contact.schema';
import { CreateSupportContactDto, PaginationQueryDto } from '../validators/support-contact.validators';

@Injectable()
export class SupportContactService {
  constructor(
    @InjectModel(SupportContact.name) private supportContactModel: Model<SupportContact>,
  ) {}

  async createSupportTicket(userId: string, createSupportContactDto: CreateSupportContactDto): Promise<SupportContact> {
    const userObjectId = new Types.ObjectId(userId);
    
    const supportContact = new this.supportContactModel({
      userId: userObjectId,
      subject: createSupportContactDto.subject,
      message: createSupportContactDto.message,
      status: 'pending', // Default status
    });

    return await supportContact.save();
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
}
