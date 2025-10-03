import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailConfig } from './email.config';
import { TemplateService } from './template.service';

@Module({
  imports: [],
  providers: [EmailService, EmailConfig, TemplateService],
  exports: [EmailService, TemplateService],
})
export class EmailModule {}
