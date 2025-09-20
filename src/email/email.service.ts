import { Injectable, Logger } from '@nestjs/common';
import { EmailConfig } from './email.config';
import { TemplateService } from './template.service';

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface WelcomeEmailData {
  fullName: string;
  email: string;
  password: string;
  domain: string;
}

export interface RejectionEmailData {
  fullName: string;
  email: string;
  domain: string;
}

export interface ContactFormEmailData {
  fullName: string;
  email: string;
  domain: string;
  message?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private emailConfig: EmailConfig,
    private templateService: TemplateService,
  ) {}

  async sendWelcomeEmail(userData: WelcomeEmailData): Promise<void> {
    const emailJob: EmailJob = {
      to: userData.email,
      subject: 'Welcome to Rose des Vins - Account Approved! 🎉',
      html: this.templateService.generateWelcomeEmail(userData),
      from: `${this.emailConfig.getFromName()} <${this.emailConfig.getFromEmail()}>`,
    };

    await this.sendEmail(emailJob);
    this.logger.log(`Welcome email sent to ${userData.email}`);
  }

  async sendRejectionEmail(userData: RejectionEmailData): Promise<void> {
    const emailJob: EmailJob = {
      to: userData.email,
      subject: 'Rose des Vins - Application Status Update',
      html: this.templateService.generateRejectionEmail(userData),
      from: `${this.emailConfig.getFromName()} <${this.emailConfig.getFromEmail()}>`,
    };

    await this.sendEmail(emailJob);
    this.logger.log(`Rejection email sent to ${userData.email}`);
  }

  async sendContactFormNotification(formData: ContactFormEmailData): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@rosedesvins.com';
    
    const emailJob: EmailJob = {
      to: adminEmail,
      subject: `New Contact Form Submission - ${formData.fullName}`,
      html: this.templateService.generateContactFormEmail(formData),
      from: `${this.emailConfig.getFromName()} <${this.emailConfig.getFromEmail()}>`,
    };
    
    await this.sendEmail(emailJob);
    this.logger.log(`Contact form notification sent to admin from ${formData.email}`);
  }

  async sendEmail(emailData: EmailJob): Promise<boolean> {
    try {
      const transporter = this.emailConfig.getTransporter();
      
      const mailOptions = {
        from: emailData.from || `${this.emailConfig.getFromName()} <${this.emailConfig.getFromEmail()}>`,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
      };

      const result = await transporter.sendMail(mailOptions);
      
      this.logger.log(`Email sent successfully to ${emailData.to}. MessageId: ${result.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${emailData.to}:`, error.message);
      throw error;
    }
  }
}
