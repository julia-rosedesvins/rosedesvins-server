import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WidgetService } from './widget.service';
import { WidgetController } from './widget.controller';
import { Subscription, SubscriptionSchema } from '../schemas/subscriptions.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { Availability, AvailabilitySchema } from '../schemas/availability.schema';
import { PaymentMethods, PaymentMethodsSchema } from '../schemas/payment-methods.schema';
import { NotificationPreferences, NotificationPreferencesSchema } from 'src/schemas/notification-preferences.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: Availability.name, schema: AvailabilitySchema },
      { name: PaymentMethods.name, schema: PaymentMethodsSchema },
      { name: NotificationPreferences.name, schema: NotificationPreferencesSchema },
    ]),
  ],
  controllers: [WidgetController],
  providers: [WidgetService],
})
export class WidgetModule {}
