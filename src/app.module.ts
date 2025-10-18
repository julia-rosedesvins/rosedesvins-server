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
import { PaymentMethodsModule } from './payment-methods/payment-methods.module';
import { WidgetModule } from './widget/widget.module';
import { UserBookingsModule } from './user-bookings/user-bookings.module';
import { EventsModule } from './events/events.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { DashboardAnalyticsModule } from './dashboard-analytics/dashboard-analytics.module';
import { SupportContactModule } from './support-contact/support-contact.module';
import { WebModule } from './web/web.module';

@Module({
  imports: [CustomConfigModule, UsersModule, EmailModule, ContactDetailsModule, SubscriptionModule, DomainProfileModule, ConnectorModule, AvailabilityModule, NotificationPreferencesModule, PaymentMethodsModule, WidgetModule, UserBookingsModule, EventsModule, NotificationsModule, ScheduleModule.forRoot(), DashboardAnalyticsModule, SupportContactModule, WebModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
