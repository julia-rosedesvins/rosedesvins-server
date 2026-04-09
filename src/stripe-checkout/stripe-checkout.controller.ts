import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { StripeCheckoutService, CreateCheckoutSessionDto } from './stripe-checkout.service';
import { UserGuard } from '../guards/user.guard';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('Stripe Checkout')
@Controller('stripe-checkout')
export class StripeCheckoutController {
  constructor(private readonly stripeCheckoutService: StripeCheckoutService) {}

  /**
   * Create a Stripe Checkout Session for a booking
   * Called by the checkout page when the customer chooses Stripe payment
   */
  @Post('session')
  @ApiOperation({ summary: 'Create a Stripe Checkout Session' })
  async createSession(
    @Body() body: {
      bookingId: string;
      vendorUserId: string;
      amountEur: number;
      successUrl: string;
      cancelUrl: string;
      customerEmail?: string;
      serviceName?: string;
      participantsAdults?: number;
      participantsEnfants?: number;
    },
  ) {
    try {
      const dto: CreateCheckoutSessionDto = {
        bookingId: body.bookingId,
        vendorUserId: body.vendorUserId,
        amountEur: body.amountEur,
        successUrl: body.successUrl,
        cancelUrl: body.cancelUrl,
        customerEmail: body.customerEmail,
        serviceName: body.serviceName,
        participantsAdults: body.participantsAdults,
        participantsEnfants: body.participantsEnfants,
      };

      const result = await this.stripeCheckoutService.createCheckoutSession(dto);

      return {
        success: true,
        message: 'Checkout session created',
        data: result,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to create checkout session',
        data: null,
      };
    }
  }

  /**
   * Stripe Webhook endpoint
   * IMPORTANT: must receive raw body — configured in main.ts
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook receiver' })
  async handleWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('stripe-signature') signature: string,
  ) {
    try {
      // req.body is the raw Buffer when configured correctly in main.ts
      await this.stripeCheckoutService.handleWebhook(req.body as Buffer, signature);
      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook handling error:', error.message);
      res.status(400).json({ error: error.message });
    }
  }

  /**
   * Get transaction by Stripe session ID (used by success page to confirm payment)
   */
  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get transaction status by Stripe session ID' })
  async getSessionStatus(@Param('sessionId') sessionId: string) {
    try {
      const transaction = await this.stripeCheckoutService.getTransactionBySessionId(sessionId);
      return {
        success: true,
        message: 'Transaction retrieved',
        data: transaction,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve session',
        data: null,
      };
    }
  }

  /**
   * Get all transactions for the authenticated vendor
   */
  @Get('transactions')
  @UseGuards(UserGuard)
  @ApiBearerAuth('user-token')
  @ApiOperation({ summary: 'Get all transactions for the current vendor' })
  async getVendorTransactions(@CurrentUser() currentUser: any) {
    try {
      const transactions = await this.stripeCheckoutService.getVendorTransactions(currentUser.sub);
      return {
        success: true,
        message: 'Transactions retrieved',
        data: transactions,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve transactions',
        data: null,
      };
    }
  }
}
