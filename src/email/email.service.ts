import { Injectable, Logger } from '@nestjs/common';
import { MailgunService } from './mailgun.service';
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
    private mailgunService: MailgunService,
    private templateService: TemplateService,
  ) {}

  async sendWelcomeEmail(userData: WelcomeEmailData): Promise<void> {
    const emailJob: EmailJob = {
      to: userData.email,
      subject: 'Bienvenue chez Rose des Vins - Compte approuvé ! 🎉',
      html: this.templateService.generateWelcomeEmail(userData),
    };

    await this.sendEmail(emailJob);
    this.logger.log(`Welcome email sent to ${userData.email}`);
  }

  async sendRejectionEmail(userData: RejectionEmailData): Promise<void> {
    const emailJob: EmailJob = {
      to: userData.email,
      subject: 'Rose des Vins - Mise à jour du statut de la candidature',
      html: this.templateService.generateRejectionEmail(userData),
    };

    await this.sendEmail(emailJob);
    this.logger.log(`Rejection email sent to ${userData.email}`);
  }

  async sendContactFormNotification(formData: ContactFormEmailData): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@rosedesvins.com';
    
    const emailJob: EmailJob = {
      to: adminEmail,
      subject: `Nouvelle soumission de formulaire de contact - ${formData.fullName}`,
      html: this.templateService.generateContactFormEmail(formData),
    };
    
    await this.sendEmail(emailJob);
    this.logger.log(`Contact form notification sent to admin from ${formData.email}`);
  }

  async sendEmail(emailData: EmailJob): Promise<boolean> {
    try {
      const mailgunOptions = {
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        from: emailData.from,
      };

      const success = await this.mailgunService.sendEmail(mailgunOptions);
      
      if (success) {
        this.logger.log(`Email sent successfully to ${emailData.to} via Mailgun HTTP API`);
      }
      
      return success;
    } catch (error) {
      this.logger.error(`Failed to send email to ${emailData.to}:`, error.message);
      throw new Error(`Failed to send contact form notification email: ${error.message}`);
    }
  }
}
