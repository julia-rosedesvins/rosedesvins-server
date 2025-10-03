import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Event, EventSchema } from '../schemas/events.schema';
import { NotificationPreferences, NotificationPreferencesSchema } from '../schemas/notification-preferences.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { EmailModule } from 'src/email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Event.name, schema: EventSchema },
      { name: NotificationPreferences.name, schema: NotificationPreferencesSchema },
      { name: User.name, schema: UserSchema },
    ]),
    EmailModule
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
