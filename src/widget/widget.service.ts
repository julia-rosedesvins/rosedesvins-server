import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subscription } from '../schemas/subscriptions.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { Availability } from '../schemas/availability.schema';
import { PaymentMethods } from '../schemas/payment-methods.schema';
import { WidgetDataQueryDto } from '../validators/widget.validators';

@Injectable()
export class WidgetService {
  constructor(
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
    @InjectModel(Availability.name) private availabilityModel: Model<Availability>,
    @InjectModel(PaymentMethods.name) private paymentMethodsModel: Model<PaymentMethods>,
  ) {}

  async getWidgetData(query: WidgetDataQueryDto) {
    const { userId, serviceId } = query;

    // Convert string IDs to ObjectIds
    const userObjectId = new Types.ObjectId(userId);
    const serviceObjectId = new Types.ObjectId(serviceId);

    // 1. Check if user subscription is active
    const subscription = await this.subscriptionModel
      .findOne({ 
        userId: userObjectId, 
        isActive: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      })
      .exec();

    if (!subscription) {
      throw new BadRequestException('User subscription is not active or has expired');
    }

    // 2. Get domain profile with the specific service
    const domainProfile = await this.domainProfileModel
      .findOne({ 
        userId: userObjectId,
        'services._id': serviceObjectId 
      })
      .exec();

    if (!domainProfile) {
      throw new NotFoundException('Domain profile or service not found');
    }

    // Find the specific service within the domain profile
    const service = domainProfile.services.find(
      (s: any) => s._id.toString() === serviceId
    );

    if (!service || !service.isActive) {
      throw new NotFoundException('Service not found or is inactive');
    }

    // 3. Get availability data (optional)
    const availability = await this.availabilityModel
      .findOne({ userId: userObjectId })
      .exec();

    // 4. Get payment methods (optional)
    const paymentMethods = await this.paymentMethodsModel
      .findOne({ userId: userId })
      .exec();

    // Return the combined data
    return {
      subscription: {
        id: subscription._id,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscription.isActive,
      },
      domainProfile: {
        domainDescription: domainProfile.domainDescription,
        domainProfilePictureUrl: domainProfile.domainProfilePictureUrl,
        domainLogoUrl: domainProfile.domainLogoUrl,
        colorCode: domainProfile.colorCode,
      },
      service: {
        id: (service as any)._id,
        name: service.name,
        description: service.description,
        numberOfPeople: service.numberOfPeople,
        pricePerPerson: service.pricePerPerson,
        timeOfServiceInMinutes: service.timeOfServiceInMinutes,
        numberOfWinesTasted: service.numberOfWinesTasted,
        languagesOffered: service.languagesOffered,
        isActive: service.isActive,
      },
      availability: availability ? {
        weeklyAvailability: availability.weeklyAvailability,
        publicHolidays: availability.publicHolidays,
        specialDateOverrides: availability.specialDateOverrides,
        timezone: availability.timezone,
        defaultSlotDuration: availability.defaultSlotDuration,
        bufferTime: availability.bufferTime,
        isActive: availability.isActive,
      } : {
        weeklyAvailability: null,
        publicHolidays: [],
        specialDateOverrides: [],
        timezone: 'Europe/Paris',
        defaultSlotDuration: 30,
        bufferTime: 0,
        isActive: false,
      },
      paymentMethods: {
        methods: paymentMethods ? paymentMethods.methods : [],
      },
    };
  }
}
