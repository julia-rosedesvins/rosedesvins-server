import { Controller, Post, Body, Get, Query, UseGuards, UsePipes, Put } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SupportContactService } from './support-contact.service';
import { UserGuard } from '../guards/user.guard';
import { AdminGuard } from '../guards/admin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  CreateSupportContactSchema, 
  CreateSupportContactDto,
  PaginationQuerySchema,
  PaginationQueryDto,
  UpdateTicketStatusSchema,
  UpdateTicketStatusDto
} from '../validators/support-contact.validators';

@ApiTags('Support Contact')
@Controller('support-contact')
export class SupportContactController {
  constructor(private readonly supportContactService: SupportContactService) {}

  @Post()
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Create a new support ticket' })
  @ApiBearerAuth('user-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        subject: { type: 'string', example: 'Issue with booking system', minLength: 3, maxLength: 200 },
        message: { type: 'string', example: 'I am experiencing difficulties with the booking system. When I try to...', minLength: 10, maxLength: 2000 }
      },
      required: ['subject', 'message']
    }
  })
  async createSupportTicket(
    @Body(new ZodValidationPipe(CreateSupportContactSchema)) createSupportContactDto: CreateSupportContactDto,
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      _id: string;
      userId: string;
      subject: string;
      message: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }> {
    try {
      const supportTicket = await this.supportContactService.createSupportTicket(user.sub, createSupportContactDto);
      
      return {
        success: true,
        message: 'Support ticket created successfully',
        data: {
          _id: (supportTicket._id as any).toString(),
          userId: supportTicket.userId.toString(),
          subject: supportTicket.subject,
          message: supportTicket.message,
          status: supportTicket.status,
          createdAt: supportTicket.createdAt!,
          updatedAt: supportTicket.updatedAt!,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('my-tickets')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Get user support tickets (paginated)' })
  @ApiBearerAuth('user-token')
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page (default: 10, max: 50)' })
  async getUserSupportTickets(
    @CurrentUser() user: any,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryDto
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      _id: string;
      userId: string;
      subject: string;
      message: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalTickets: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    try {
      const result = await this.supportContactService.getUserSupportTickets(user.sub, query);
      
      const formattedTickets = result.tickets.map(ticket => ({
        _id: (ticket._id as any).toString(),
        userId: ticket.userId.toString(),
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        createdAt: ticket.createdAt!,
        updatedAt: ticket.updatedAt!,
      }));

      return {
        success: true,
        message: 'Support tickets retrieved successfully',
        data: formattedTickets,
        pagination: result.pagination,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('admin/all-tickets')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get all support tickets for admin (paginated)' })
  @ApiBearerAuth('admin-token')
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page (default: 10, max: 50)' })
  async getAllSupportTickets(
    @CurrentAdmin() admin: any,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryDto
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      _id: string;
      userId: {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
        domainName?: string;
      };
      subject: string;
      message: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }[];
    pagination: {
      currentPage: number;
      totalPages: number;
      totalTickets: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    try {
      const result = await this.supportContactService.getAllSupportTickets(query);
      
      const formattedTickets = result.tickets.map(ticket => ({
        _id: (ticket._id as any).toString(),
        userId: {
          _id: (ticket.userId as any)._id.toString(),
          firstName: (ticket.userId as any).firstName,
          lastName: (ticket.userId as any).lastName,
          email: (ticket.userId as any).email,
          domainName: (ticket.userId as any).domainName,
        },
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        createdAt: ticket.createdAt!,
        updatedAt: ticket.updatedAt!,
      }));

      return {
        success: true,
        message: 'All support tickets retrieved successfully',
        data: formattedTickets,
        pagination: result.pagination,
      };
    } catch (error) {
      throw error;
    }
  }

  @Put('admin/update-status')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update support ticket status' })
  @ApiBearerAuth('admin-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ticketId: { type: 'string', example: '60d0fe4f5311236168a109ca', description: 'MongoDB ObjectId of the ticket' },
        status: { type: 'string', enum: ['pending', 'in-progress', 'resolved', 'closed'], example: 'in-progress' }
      },
      required: ['ticketId', 'status']
    }
  })
  async updateTicketStatus(
    @Body(new ZodValidationPipe(UpdateTicketStatusSchema)) updateTicketStatusDto: UpdateTicketStatusDto,
    @CurrentAdmin() admin: any
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      _id: string;
      userId: {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
        domainName?: string;
      };
      subject: string;
      message: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    };
  }> {
    try {
      const updatedTicket = await this.supportContactService.updateTicketStatus(
        updateTicketStatusDto.ticketId,
        updateTicketStatusDto.status
      );
      
      return {
        success: true,
        message: `Ticket status updated to ${updateTicketStatusDto.status} successfully`,
        data: {
          _id: (updatedTicket._id as any).toString(),
          userId: {
            _id: (updatedTicket.userId as any)._id.toString(),
            firstName: (updatedTicket.userId as any).firstName,
            lastName: (updatedTicket.userId as any).lastName,
            email: (updatedTicket.userId as any).email,
            domainName: (updatedTicket.userId as any).domainName,
          },
          subject: updatedTicket.subject,
          message: updatedTicket.message,
          status: updatedTicket.status,
          createdAt: updatedTicket.createdAt!,
          updatedAt: updatedTicket.updatedAt!,
        },
      };
    } catch (error) {
      throw error;
    }
  }
}
