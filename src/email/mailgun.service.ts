import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface MailgunEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  text?: string;
}

@Injectable()
export class MailgunService {
  private readonly logger = new Logger(MailgunService.name);
  private readonly httpClient: AxiosInstance;
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('MAILGUN_API_KEY') || '';
    this.domain = this.configService.get<string>('MAILGUN_DOMAIN') || 'mail.rosedesvins.co';
    
    if (!this.apiKey) {
      this.logger.warn('⚠️  MAILGUN_API_KEY not found in environment variables');
      this.logger.warn('📧 Please add MAILGUN_API_KEY to your .env file to use Mailgun HTTP API');
    }
    
    // Use EU region if using smtp.eu.mailgun.org
    const smtpHost = this.configService.get<string>('SMTP_HOST') || 'smtp.eu.mailgun.org';
    this.baseUrl = smtpHost.includes('.eu.') 
      ? 'https://api.eu.mailgun.net/v3' 
      : 'https://api.mailgun.net/v3';

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      auth: {
        username: 'api',
        password: this.apiKey,
      },
      timeout: 30000, // 30 second timeout
    });

    this.logger.log(`📧 Mailgun HTTP service initialized - Domain: ${this.domain}, Region: ${smtpHost.includes('.eu.') ? 'EU' : 'US'}`);
    
    // Verify configuration on startup in production
    if (process.env.NODE_ENV === 'production' && this.apiKey) {
      this.verifyConfiguration();
    }
  }

  async sendEmail(emailOptions: MailgunEmailOptions): Promise<boolean> {
    try {
      const formData = new FormData();
      
      // Required fields
      formData.append('from', emailOptions.from || this.getDefaultFromEmail());
      formData.append('to', emailOptions.to);
      formData.append('subject', emailOptions.subject);
      
      // Content
      if (emailOptions.html) {
        formData.append('html', emailOptions.html);
      }
      if (emailOptions.text) {
        formData.append('text', emailOptions.text);
      }

      // Send the email via Mailgun HTTP API
      const response = await this.httpClient.post(
        `/${this.domain}/messages`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      if (response.data && response.data.id) {
        this.logger.log(`Email sent successfully to ${emailOptions.to}. Mailgun ID: ${response.data.id}`);
        return true;
      } else {
        throw new Error('Invalid response from Mailgun API');
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${emailOptions.to}:`, error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        this.logger.error('Authentication failed - check MAILGUN_API_KEY');
      } else if (error.response?.status === 404) {
        this.logger.error(`Domain not found - check MAILGUN_DOMAIN: ${this.domain}`);
      }
      
      throw error;
    }
  }

  async verifyConfiguration(): Promise<boolean> {
    try {
      this.logger.log('🔄 Verifying Mailgun HTTP API configuration...');
      
      const response = await this.httpClient.get(`/domains/${this.domain}`);
      
      if (response.data && response.data.domain) {
        this.logger.log(`✅ Mailgun domain verified: ${response.data.domain.name} (State: ${response.data.domain.state})`);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error('❌ Mailgun configuration verification failed:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        this.logger.error('🔑 Authentication failed - Invalid API key');
      } else if (error.response?.status === 404) {
        this.logger.error('🌐 Domain not found - Check domain configuration');
      }
      
      return false;
    }
  }

  private getDefaultFromEmail(): string {
    return this.configService.get<string>('FROM_EMAIL') || 'noreply@rosedesvins.co';
  }

  getFromName(): string {
    return this.configService.get<string>('FROM_NAME') || 'Rose des Vins';
  }
}