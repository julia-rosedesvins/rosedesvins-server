import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailConfig {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const smtpConfig: any = {
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port: this.configService.get<number>('SMTP_PORT') || 587,
      secure: this.configService.get<boolean>('SMTP_SECURE') || false, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    };

    // Add additional configuration for common email providers
    const host = smtpConfig.host;
    if (host.includes('ethereal')) {
      // Ethereal email specific settings
      smtpConfig.secure = false;
      smtpConfig.requireTLS = true;
      smtpConfig.tls = {
        rejectUnauthorized: false,
      };
    } else if (host.includes('gmail')) {
      // Gmail specific settings
      smtpConfig.secure = false;
      smtpConfig.requireTLS = true;
      smtpConfig.tls = {
        rejectUnauthorized: false,
      };
    }

    this.transporter = nodemailer.createTransport(smtpConfig);
  }

  getTransporter(): nodemailer.Transporter {
    return this.transporter;
  }

  getFromEmail(): string {
    return this.configService.get<string>('FROM_EMAIL') || 'noreply@rosedesvins.com';
  }

  getFromName(): string {
    return this.configService.get<string>('FROM_NAME') || 'Rose des Vins';
  }
}
