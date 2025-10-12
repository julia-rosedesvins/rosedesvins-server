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
import { EmailService } from '../email/email.service';
import { EmailConfig } from '../email/email.config';
import { TemplateService } from '../email/template.service';
import { EncryptionService } from '../common/encryption.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: UserBooking.name, schema: UserBookingSchema },
      { name: User.name, schema: UserSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: Event.name, schema: EventSchema },
      { name: Connector.name, schema: ConnectorSchema },
    ]),
  ],
  controllers: [UserBookingsController],
  providers: [
    UserBookingsService, 
    EmailService, 
    EmailConfig, 
    TemplateService, 
    EncryptionService
  ],
})
export class UserBookingsModule {}
