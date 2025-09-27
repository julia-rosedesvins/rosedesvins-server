import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WidgetService } from './widget.service';
import { WidgetController } from './widget.controller';
import { Subscription, SubscriptionSchema } from '../schemas/subscriptions.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { Availability, AvailabilitySchema } from '../schemas/availability.schema';
import { PaymentMethods, PaymentMethodsSchema } from '../schemas/payment-methods.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: Availability.name, schema: AvailabilitySchema },
      { name: PaymentMethods.name, schema: PaymentMethodsSchema },
    ]),
  ],
  controllers: [WidgetController],
  providers: [WidgetService],
})
export class WidgetModule {}
