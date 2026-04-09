import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PaymentMethods, PaymentMethodsDocument } from '../schemas/payment-methods.schema';
import { CreateOrUpdatePaymentMethodsDto } from '../validators/payment-methods.validators';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectModel(PaymentMethods.name)
    private paymentMethodsModel: Model<PaymentMethodsDocument>,
  ) {}

  /**
   * Create or update payment methods for a user
   * @param userId - The user ID
   * @param updateData - Payment methods data to create or update
   * @returns Updated or created payment methods
   */
  async createOrUpdatePaymentMethods(
    userId: string,
    updateData: CreateOrUpdatePaymentMethodsDto,
  ): Promise<PaymentMethodsDocument> {
    try {
      console.log('Creating or updating payment methods for userId:', userId);
      // Use findOneAndUpdate with upsert: true to create if not exists, update if exists
      const paymentMethods = await this.paymentMethodsModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            ...updateData,
            userId, // Ensure userId is set
          }
        },
        {
          new: true, // Return the updated document
          upsert: true, // Create if document doesn't exist
          runValidators: true, // Run schema validators
        }
      ).exec();

      return paymentMethods;
    } catch (error) {
      console.error('Error in createOrUpdatePaymentMethods:', error);
      throw error;
    }
  }

  /**
   * Get payment methods for a user
   * @param userId - The user ID
   * @returns Payment methods document or null if not found
   */
  async getPaymentMethods(
    userId: string,
  ): Promise<PaymentMethodsDocument | null> {
    try {
      const paymentMethods = await this.paymentMethodsModel
        .findOne({ userId })
        .exec();

      return paymentMethods;
    } catch (error) {
      console.error('Error in getPaymentMethods:', error);
      throw error;
    }
  }

  /**
   * Save Stripe Connect account details
   * @param userId - The user ID
   * @param stripeAccountId - Stripe connected account ID
   * @param displayName - Business name from Stripe
   * @param chargesEnabled - Whether charges are enabled
   */
  async saveStripeConnectAccount(
    userId: string,
    stripeAccountId: string,
    displayName?: string,
    chargesEnabled: boolean = false,
  ): Promise<PaymentMethodsDocument> {
    try {
      const paymentMethods = await this.paymentMethodsModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            userId,
            stripeConnect: {
              stripeAccountId,
              displayName,
              chargesEnabled,
              connectedAt: new Date(),
              isVerified: false,
            },
          },
          $addToSet: { methods: 'stripe' },
        },
        {
          new: true,
          upsert: true,
          runValidators: false,
        }
      ).exec();

      return paymentMethods;
    } catch (error) {
      console.error('Error saving Stripe Connect account:', error);
      throw error;
    }
  }

  /**
   * Update Stripe Connect account verification status
   * @param userId - The user ID
   * @param isVerified - Verification status
   * @param chargesEnabled - Whether charges are enabled
   */
  async updateStripeConnectStatus(
    userId: string,
    isVerified: boolean,
    chargesEnabled: boolean,
  ): Promise<PaymentMethodsDocument | null> {
    try {
      return await this.paymentMethodsModel.findOneAndUpdate(
        { userId },
        {
          $set: {
            'stripeConnect.isVerified': isVerified,
            'stripeConnect.chargesEnabled': chargesEnabled,
          }
        },
        { new: true }
      ).exec();
    } catch (error) {
      console.error('Error updating Stripe Connect status:', error);
      throw error;
    }
  }

  /**
   * Remove Stripe Connect account
   * @param userId - The user ID
   */
  async removeStripeConnectAccount(userId: string): Promise<PaymentMethodsDocument | null> {
    try {
      return await this.paymentMethodsModel.findOneAndUpdate(
        { userId },
        {
          $set: { stripeConnect: null },
          $pull: { methods: 'stripe' },
        },
        { new: true }
      ).exec();
    } catch (error) {
      console.error('Error removing Stripe Connect account:', error);
      throw error;
    }
  }
}
