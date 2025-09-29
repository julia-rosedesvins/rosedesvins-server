import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { Event, EventSchema } from '../schemas/events.schema';
import { UserBooking, UserBookingSchema } from '../schemas/user-bookings.schema';
import { UserGuard } from '../guards/user.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: UserBooking.name, schema: UserBookingSchema }, // For populating booking details
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [EventsController],
  providers: [EventsService, UserGuard],
  exports: [EventsService],
})
export class EventsModule {}
