import { Controller, Post, Get, Query, Body, UseGuards, Redirect } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentMethodsService } from './payment-methods.service';
import { StripeConnectService } from './stripe-connect.service';
import { UserGuard } from '../guards/user.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  CreateOrUpdatePaymentMethodsSchema,
  CreateOrUpdatePaymentMethodsDto
} from '../validators/payment-methods.validators';
import { PAYMENT_METHOD_OPTIONS } from '../schemas/payment-methods.schema';

@ApiTags('Payment Methods')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly stripeConnectService: StripeConnectService,
  ) {}

  @Post('create-or-update')
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Create or update payment methods',
    description: 'Creates new payment methods or updates existing ones for the current user'
  })
  @ApiBearerAuth('user-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        methods: { 
          type: 'array', 
          items: {
            type: 'string',
            enum: Object.values(PAYMENT_METHOD_OPTIONS)
          },
          example: [PAYMENT_METHOD_OPTIONS.BANK_CARD, PAYMENT_METHOD_OPTIONS.CASH],
          description: 'Array of selected payment methods',
          maxItems: 3,
          uniqueItems: true
        }
      },
      additionalProperties: false
    }
  })
  async createOrUpdatePaymentMethods(
    @Body(
      new ZodValidationPipe(CreateOrUpdatePaymentMethodsSchema)
    ) createOrUpdateDto: CreateOrUpdatePaymentMethodsDto,
    @CurrentUser() currentUser: any,
  ) {
    try {      
      const paymentMethods = await this.paymentMethodsService
        .createOrUpdatePaymentMethods(currentUser.sub, createOrUpdateDto);

      return {
        success: true,
        message: 'Payment methods saved successfully',
        data: paymentMethods.toObject(),
      };
    } catch (error) {
      throw error;
    }
  }

  @Get()
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Get payment methods',
    description: 'Retrieves payment methods for the current user'
  })
  @ApiBearerAuth('user-token')
  async getPaymentMethods(
    @CurrentUser() currentUser: any,
  ) {
    try {      
      const paymentMethods = await this.paymentMethodsService
        .getPaymentMethods(currentUser.sub);

      if (!paymentMethods) {
        return {
          success: true,
          message: 'No payment methods found for user',
          data: null,
        };
      }

      return {
        success: true,
        message: 'Payment methods retrieved successfully',
        data: paymentMethods.toObject(),
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('stripe/auth-url')
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Get Stripe Connect authorization URL',
    description: 'Generates the authorization URL for Stripe Connect OAuth flow'
  })
  @ApiBearerAuth('user-token')
  async getStripeAuthUrl(
    @CurrentUser() currentUser: any,
  ) {
    try {
      const authUrl = this.stripeConnectService.generateAuthorizationUrl(currentUser.sub);
      
      return {
        success: true,
        message: 'Authorization URL generated',
        data: {
          authUrl,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to generate authorization URL',
        data: null,
      };
    }
  }

  @Get('stripe/callback')
  @Redirect('', 302)
  @ApiOperation({ 
    summary: 'Stripe Connect OAuth callback',
    description: 'Handles Stripe OAuth callback and saves account details'
  })
  async stripeCallback(
    @Query('code') code: string,
    @Query('state') userId: string,
    @Query('error') error?: string,
  ) {
    try {
      // Handle error from Stripe
      if (error) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return {
          url: `${frontendUrl}/dashboard/settings?stripe_error=${encodeURIComponent(error)}`,
        };
      }

      if (!code || !userId) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return {
          url: `${frontendUrl}/dashboard/settings?stripe_error=Invalid+callback+parameters`,
        };
      }

      // Exchange code for access token
      const accountDetails = await this.stripeConnectService.handleOAuthCallback(code);

      // Save Stripe account to database
      await this.paymentMethodsService.saveStripeConnectAccount(
        userId,
        accountDetails.stripeAccountId,
        accountDetails.displayName,
        accountDetails.chargesEnabled,
      );

      // Redirect to dashboard with success message
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return {
        url: `${frontendUrl}/dashboard/settings?stripe_success=true&account_id=${accountDetails.stripeAccountId}`,
      };
    } catch (error: any) {
      console.error('Stripe callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return {
        url: `${frontendUrl}/dashboard/settings?stripe_error=${encodeURIComponent(error.message || 'Failed to connect Stripe account')}`,
      };
    }
  }

  @Post('stripe/disconnect')
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Disconnect Stripe Connect account',
    description: 'Disconnects the user\'s Stripe Connected Account'
  })
  @ApiBearerAuth('user-token')
  async disconnectStripe(
    @CurrentUser() currentUser: any,
  ) {
    try {
      const paymentMethods = await this.paymentMethodsService.getPaymentMethods(currentUser.sub);
      
      if (!paymentMethods?.stripeConnect?.stripeAccountId) {
        return {
          success: false,
          message: 'No Stripe account connected',
          data: null,
        };
      }

      // Disconnect from Stripe
      await this.stripeConnectService.disconnectAccount(paymentMethods.stripeConnect.stripeAccountId);

      // Remove from database
      const updated = await this.paymentMethodsService.removeStripeConnectAccount(currentUser.sub);

      return {
        success: true,
        message: 'Stripe account disconnected successfully',
        data: updated?.toObject() || null,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to disconnect Stripe account',
        data: null,
      };
    }
  }

  @Get('stripe/status')
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Get Stripe Connect status',
    description: 'Gets the current Stripe Connect account status and verification'
  })
  @ApiBearerAuth('user-token')
  async getStripeStatus(
    @CurrentUser() currentUser: any,
  ) {
    try {
      const paymentMethods = await this.paymentMethodsService.getPaymentMethods(currentUser.sub);
      
      if (!paymentMethods?.stripeConnect?.stripeAccountId) {
        return {
          success: true,
          message: 'No Stripe account connected',
          data: null,
        };
      }

      // Get current status from Stripe
      const status = await this.stripeConnectService.verifyConnectedAccount(
        paymentMethods.stripeConnect.stripeAccountId,
      );

      // Update in database if status changed
      if (status.isVerified !== paymentMethods.stripeConnect.isVerified ||
          status.chargesEnabled !== paymentMethods.stripeConnect.chargesEnabled) {
        await this.paymentMethodsService.updateStripeConnectStatus(
          currentUser.sub,
          status.isVerified,
          status.chargesEnabled,
        );
      }

      return {
        success: true,
        message: 'Stripe status retrieved',
        data: {
          ...paymentMethods.stripeConnect,
          ...status,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to get Stripe status',
        data: null,
      };
    }
  }
}
