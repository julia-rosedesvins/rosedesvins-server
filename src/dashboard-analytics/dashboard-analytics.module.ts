import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { DashboardAnalyticsController } from './dashboard-analytics.controller';
import { UserBooking, UserBookingSchema } from '../schemas/user-bookings.schema';
import { Event, EventSchema } from '../schemas/events.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { Subscription, SubscriptionSchema } from '../schemas/subscriptions.schema';
import { SupportContact, SupportContactSchema } from '../schemas/support-contact.schema';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserBooking.name, schema: UserBookingSchema },
      { name: Event.name, schema: EventSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: SupportContact.name, schema: SupportContactSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [DashboardAnalyticsController],
  providers: [DashboardAnalyticsService],
  exports: [DashboardAnalyticsService],
})
export class DashboardAnalyticsModule {}
