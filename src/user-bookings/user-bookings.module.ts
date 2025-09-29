import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserBookingsService } from './user-bookings.service';
import { UserBookingsController } from './user-bookings.controller';
import { UserBooking, UserBookingSchema } from '../schemas/user-bookings.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { Subscription, SubscriptionSchema } from '../schemas/subscriptions.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserBooking.name, schema: UserBookingSchema },
      { name: User.name, schema: UserSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [UserBookingsController],
  providers: [UserBookingsService],
})
export class UserBookingsModule {}
