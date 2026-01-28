import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { NewsletterService } from './newsletter.service';
import { AdminGuard } from '../guards/admin.guard';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  SubscribeDto, 
  SubscribeSchema 
} from './dto/subscribe.dto';
import {
  ApproveSubscriptionDto,
  ApproveSubscriptionSchema
} from './dto/approve-subscription.dto';
import {
  RejectSubscriptionDto,
  RejectSubscriptionSchema
} from './dto/reject-subscription.dto';

@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {
    console.log('✅ NewsletterController initialized');
  }

  @Post('subscribe')
  async subscribe(
    @Body(new ZodValidationPipe(SubscribeSchema)) subscribeDto: SubscribeDto,
  ) {
    const subscription = await this.newsletterService.subscribe(subscribeDto);
    return {
      success: true,
      message: 'Merci pour votre inscription ! Votre demande est en cours de traitement.',
      data: subscription,
    };
  }

  @Get('pending')
  @UseGuards(AdminGuard)
  async getPendingSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    const result = await this.newsletterService.getPendingSubscriptions({
      page: pageNum,
      limit: limitNum,
    });

    return {
      success: true,
      data: result.subscriptions,
      pagination: result.pagination,
    };
  }

  @Get('approved')
  @UseGuards(AdminGuard)
  async getApprovedSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    const result = await this.newsletterService.getApprovedSubscriptions({
      page: pageNum,
      limit: limitNum,
    });

    return {
      success: true,
      data: result.subscriptions,
      pagination: result.pagination,
    };
  }

  @Get('rejected')
  @UseGuards(AdminGuard)
  async getRejectedSubscriptions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    
    const result = await this.newsletterService.getRejectedSubscriptions({
      page: pageNum,
      limit: limitNum,
    });

    return {
      success: true,
      data: result.subscriptions,
      pagination: result.pagination,
    };
  }

  @Post('approve')
  @UseGuards(AdminGuard)
  async approveAndCreateUser(
    @Body(new ZodValidationPipe(ApproveSubscriptionSchema)) approveDto: ApproveSubscriptionDto,
    @Request() req: any,
  ) {
    const adminId = req.user.userId;
    const result = await this.newsletterService.approveAndCreateUser(approveDto, adminId);
    
    return {
      success: true,
      message: 'Souscription approuvée et compte utilisateur créé avec succès',
      data: {
        subscription: result.subscription,
        user: {
          id: result.user._id,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          email: result.user.email,
          domainName: result.user.domainName,
        },
      },
    };
  }

  @Post('reject')
  @UseGuards(AdminGuard)
  async rejectSubscription(
    @Body(new ZodValidationPipe(RejectSubscriptionSchema)) rejectDto: RejectSubscriptionDto,
    @Request() req: any,
  ) {
    const adminId = req.user.userId;
    const subscription = await this.newsletterService.rejectSubscription(rejectDto, adminId);
    
    return {
      success: true,
      message: 'Souscription rejetée',
      data: subscription,
    };
  }
}
