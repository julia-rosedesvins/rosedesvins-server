import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailConfig } from './email.config';
import { MailgunService } from './mailgun.service';
import { TemplateService } from './template.service';

@Module({
  imports: [],
  providers: [EmailService, EmailConfig, MailgunService, TemplateService],
  exports: [EmailService, TemplateService, MailgunService],
})
export class EmailModule {}
