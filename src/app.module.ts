import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CustomConfigModule } from './config/config.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { ContactDetailsModule } from './contact-details/contact-details.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { DomainProfileModule } from './domain-profile/domain-profile.module';
import { ConnectorModule } from './connector/connector.module';
import { AvailabilityModule } from './availability/availability.module';
import { NotificationPreferencesModule } from './notification-preferences/notification-preferences.module';

@Module({
  imports: [CustomConfigModule, UsersModule, EmailModule, ContactDetailsModule, SubscriptionModule, DomainProfileModule, ConnectorModule, AvailabilityModule, NotificationPreferencesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
