import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StripeLib = require('stripe');
import type { Stripe as StripeType } from 'stripe/cjs/stripe.core.js';

@Injectable()
export class StripeConnectService {
  private stripe: StripeType;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }

    this.stripe = new StripeLib(secretKey);

    this.clientId = this.configService.get<string>('STRIPE_OAUTH_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('STRIPE_OAUTH_CLIENT_SECRET') || '';
    this.redirectUri = this.configService.get<string>('STRIPE_REDIRECT_URI') || '';
  }

  /**
   * Generate the authorization URL for Stripe Connect OAuth flow
   * @param userId - The user ID (stored as state for security)
   * @returns Authorization URL that user should visit
   */
  generateAuthorizationUrl(userId: string): string {
    if (!this.clientId || !this.redirectUri) {
      throw new Error('Stripe OAuth configuration is not complete');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'read_write',
      redirect_uri: this.redirectUri,
      state: userId,
    });

    return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token and retrieve account details
   * @param code - Authorization code from Stripe OAuth callback
   * @returns Object containing stripeAccountId and account details
   */
  async handleOAuthCallback(code: string): Promise<{
    stripeAccountId: string;
    displayName?: string;
    chargesEnabled: boolean;
  }> {
    if (!this.clientSecret) {
      throw new Error('STRIPE_CLIENT_SECRET is not configured');
    }

    try {
      // Exchange code for access token
      const tokenResponse = await this.stripe.oauth.token({
        grant_type: 'authorization_code',
        code,
      });

      const stripeAccountId = tokenResponse.stripe_user_id as string;

      // Retrieve account details
      const account = await this.stripe.accounts.retrieve(stripeAccountId);

      return {
        stripeAccountId,
        displayName: account.business_profile?.name ?? account.company?.name ?? undefined,
        chargesEnabled: account.charges_enabled || false,
      };
    } catch (error) {
      console.error('Error exchanging Stripe OAuth code:', error);
      throw new Error('Failed to connect Stripe account');
    }
  }

  /**
   * Verify if a Stripe Connected Account has proper setup
   * @param stripeAccountId - The connected account ID
   * @returns Account verification status
   */
  async verifyConnectedAccount(stripeAccountId: string): Promise<{
    isVerified: boolean;
    chargesEnabled: boolean;
    requiresVerification: boolean;
    verificationFields?: string[];
  }> {
    try {
      const account = await this.stripe.accounts.retrieve(stripeAccountId);
      const chargesEnabled = account.charges_enabled || false;
      const requiresVerification = !chargesEnabled;
      const pendingFields = (account.requirements?.currently_due ?? []) as string[];

      return {
        isVerified: chargesEnabled,
        chargesEnabled,
        requiresVerification,
        verificationFields: pendingFields.length > 0 ? pendingFields : undefined,
      };
    } catch (error) {
      console.error('Error verifying Stripe account:', error);
      throw new Error('Failed to verify Stripe account');
    }
  }

  /**
   * Disconnect a Stripe Connected Account
   * @param stripeAccountId - The connected account ID
   */
  async disconnectAccount(stripeAccountId: string): Promise<boolean> {
    try {
      await this.stripe.oauth.deauthorize({
        client_id: this.clientId,
        stripe_user_id: stripeAccountId,
      });

      return true;
    } catch (error) {
      console.error('Error disconnecting Stripe account:', error);
      throw new Error('Failed to disconnect Stripe account');
    }
  }

  /**
   * Get account details from Stripe
   * @param stripeAccountId - The connected account ID
   */
  async getAccountDetails(stripeAccountId: string): Promise<any> {
    try {
      return await this.stripe.accounts.retrieve(stripeAccountId);
    } catch (error) {
      console.error('Error retrieving Stripe account details:', error);
      throw new Error('Failed to retrieve account details');
    }
  }

  /**
   * Create a payment intent with application fee for marketplace
   * This would be used during actual payment processing
   * @param stripeAccountId - The connected account ID
   * @param amount - Amount in cents
   * @param currency - Currency code (e.g., 'eur')
   * @param applicationFeePercent - Platform fee percentage (e.g., 10 for 10%)
   */
  async createPaymentIntent(
    stripeAccountId: string,
    amount: number,
    currency: string = 'eur',
    applicationFeePercent: number = 10,
  ): Promise<StripeType.Response<StripeType.PaymentIntent>> {
    try {
      const applicationFeeAmount = Math.round((amount * applicationFeePercent) / 100);

      return await this.stripe.paymentIntents.create({
        amount,
        currency,
        application_fee_amount: applicationFeeAmount,
      }, {
        stripeAccount: stripeAccountId,
      });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw new Error('Failed to create payment intent');
    }
  }
}
