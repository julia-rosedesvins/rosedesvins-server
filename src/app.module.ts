import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CustomConfigModule } from './config/config.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { ContactDetailsModule } from './contact-details/contact-details.module';

@Module({
  imports: [CustomConfigModule, UsersModule, EmailModule, ContactDetailsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
