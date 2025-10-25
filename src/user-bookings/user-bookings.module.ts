import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { UserBookingsService } from './user-bookings.service';
import { UserBookingsController } from './user-bookings.controller';
import { UserBooking, UserBookingSchema } from '../schemas/user-bookings.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { Subscription, SubscriptionSchema } from '../schemas/subscriptions.schema';
import { Event, EventSchema } from '../schemas/events.schema';
import { Connector, ConnectorSchema } from 'src/schemas/connector.schema';
import { EmailModule } from '../email/email.module';
import { EncryptionService } from '../common/encryption.service';
import { ConnectorService } from '../connector/connector.service';
import { PaymentMethods, PaymentMethodsSchema } from 'src/schemas/payment-methods.schema';

@Module({
  imports: [
    ConfigModule,
    EmailModule, // Import the EmailModule instead of individual services
    MongooseModule.forFeature([
      { name: UserBooking.name, schema: UserBookingSchema },
      { name: User.name, schema: UserSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Event.name, schema: EventSchema },
      { name: Connector.name, schema: ConnectorSchema },
      { name: PaymentMethods.name, schema: PaymentMethodsSchema },
    ]),
  ],
  controllers: [UserBookingsController],
  providers: [
    UserBookingsService, 
    EncryptionService,
    ConnectorService
  ],
})
export class UserBookingsModule {}
