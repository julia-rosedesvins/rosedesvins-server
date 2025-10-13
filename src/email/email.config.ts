import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailConfig {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    const smtpConfig: any = {
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.eu.mailgun.org',
      port: this.configService.get<number>('SMTP_PORT') || 587,
      secure: this.configService.get<boolean>('SMTP_SECURE') || false,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
      // Production-optimized timeouts
      connectionTimeout: 60000, // 60 seconds
      greetingTimeout: 30000,   // 30 seconds  
      socketTimeout: 60000,     // 60 seconds
      logger: process.env.NODE_ENV === 'development',
      debug: process.env.NODE_ENV === 'development',
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
    } else if (host.includes('mailgun') || host.includes('smtp.eu.mailgun.org') || host.includes('smtp.mailgun.org')) {
      // Mailgun specific settings optimized for production
      smtpConfig.secure = false; // Use STARTTLS on port 587
      smtpConfig.requireTLS = true;
      smtpConfig.tls = {
        rejectUnauthorized: true, // Mailgun has valid certificates
        ciphers: 'SSLv3',
      };
      
      // Production-optimized connection settings for Mailgun
      smtpConfig.connectionTimeout = 60000; // 60 seconds
      smtpConfig.greetingTimeout = 30000;   // 30 seconds
      smtpConfig.socketTimeout = 60000;     // 60 seconds
      
      // Connection pooling for better performance
      smtpConfig.pool = true;
      smtpConfig.maxConnections = 5;
      smtpConfig.maxMessages = 10;
      smtpConfig.rateLimit = 14; // 14 emails per second (Mailgun limit is 15)
      
      // Retry configuration
      smtpConfig.retry = 3;
      smtpConfig.retryDelay = 1000; // 1 second between retries
    }

    this.transporter = nodemailer.createTransport(smtpConfig);
    
    // Verify connection on startup (production only)
    if (process.env.NODE_ENV === 'production') {
      this.verifyConnection();
    }
  }

  private async verifyConnection() {
    try {
      console.log('🔄 Verifying Mailgun SMTP connection...');
      await this.transporter.verify();
      console.log('✅ Mailgun SMTP connection verified successfully');
    } catch (error) {
      console.error('❌ Mailgun SMTP connection failed:', error);
      console.error('📧 Email Configuration Details:');
      console.error(`   Host: ${this.configService.get('SMTP_HOST')}`);
      console.error(`   Port: ${this.configService.get('SMTP_PORT')}`);
      console.error(`   User: ${this.configService.get('SMTP_USER')}`);
      console.error(`   Pass: ${this.configService.get('SMTP_PASS') ? '***HIDDEN***' : 'NOT SET'}`);
    }
  }

  getTransporter(): nodemailer.Transporter {
    return this.transporter;
  }

  getFromEmail(): string {
    return this.configService.get<string>('FROM_EMAIL') || 'noreply@rosedesvins.co';
  }

  getFromName(): string {
    return this.configService.get<string>('FROM_NAME') || 'Rose des Vins';
  }
}
