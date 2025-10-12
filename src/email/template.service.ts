import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export interface TemplateData {
  [key: string]: any;
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

export interface CustomerNotificationEmailData {
  customerName: string;
  customerEmail: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventTimezone: string;
  eventDuration?: string;
  eventLocation?: string;
  eventDescription?: string;
  providerName?: string;
  hoursBeforeEvent: number;
}

export interface ProviderNotificationEmailData {
  providerName: string;
  providerEmail: string;
  customerName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventTimezone: string;
  eventDuration?: string;
  eventLocation?: string;
  eventDescription?: string;
  hoursBeforeEvent: number;
}

export interface BookingEmailTemplateData {
  customerName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventTimezone: string;
  eventDuration: string;
  participantsText: string;
  selectedLanguage: string;
  additionalNotes?: string;
}

@Injectable()
export class TemplateService {
  private templatesPath: string;
  private baseTemplate: handlebars.TemplateDelegate;

  constructor(private configService: ConfigService) {
    // Use the source path directly for development and production
    this.templatesPath = path.join(process.cwd(), 'src', 'email', 'templates', 'hbs');
    this.loadBaseTemplate();
  }

  private loadBaseTemplate(): void {
    try {
      const baseTemplatePath = path.join(this.templatesPath, 'base.hbs');
      const baseTemplateContent = fs.readFileSync(baseTemplatePath, 'utf8');
      this.baseTemplate = handlebars.compile(baseTemplateContent);
    } catch (error) {
      console.error('Error loading base template:', error);
      throw new Error(`Failed to load base template: ${error.message}`);
    }
  }

  private loadTemplate(templateName: string): handlebars.TemplateDelegate {
    try {
      const templatePath = path.join(this.templatesPath, `${templateName}.hbs`);
      const templateContent = fs.readFileSync(templatePath, 'utf8');
      return handlebars.compile(templateContent);
    } catch (error) {
      console.error(`Error loading template ${templateName}:`, error);
      throw new Error(`Failed to load template ${templateName}: ${error.message}`);
    }
  }

  private getBaseData(): TemplateData {
    return {
      companyName: 'Rose des Vins',
      logoUrl: this.configService.get<string>('APP_LOGO'),
      currentYear: new Date().getFullYear(),
      supportEmail: this.configService.get<string>('ADMIN_EMAIL') || 'admin@rosedesvins.com',
      loginUrl: `${this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000'}/login`,
      adminPanelUrl: `${this.configService.get<string>('CLIENT_URL') || 'http://localhost:3000'}/admin/clients`,
    };
  }

  generateWelcomeEmail(data: WelcomeEmailData): string {
    const welcomeTemplate = this.loadTemplate('welcome');
    const contentHtml = welcomeTemplate({
      ...data,
      loginUrl: this.getBaseData().loginUrl,
    });

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Welcome to Rose des Vins',
      subtitle: 'Your Account Has Been Approved',
      content: contentHtml,
    });
  }

  generateRejectionEmail(data: RejectionEmailData): string {
    const rejectionTemplate = this.loadTemplate('rejection');
    const contentHtml = rejectionTemplate(data);

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Application Status Update',
      subtitle: 'Thank you for your interest',
      content: contentHtml,
    });
  }

  generateContactFormEmail(data: ContactFormEmailData): string {
    const contactFormTemplate = this.loadTemplate('contact-form');
    const contentHtml = contactFormTemplate({
      ...data,
      adminPanelUrl: this.getBaseData().adminPanelUrl,
    });

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'New Contact Form Submission',
      subtitle: 'Admin Notification',
      content: contentHtml,
    });
  }

  generateCustomerNotificationEmail(data: CustomerNotificationEmailData): string {
    const customerNotificationTemplate = this.loadTemplate('customer-notification');
    const contentHtml = customerNotificationTemplate({
      ...data,
      loginUrl: this.getBaseData().loginUrl,
    });

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Upcoming Wine Experience Reminder',
      subtitle: `Your reservation is in ${data.hoursBeforeEvent} hours`,
      content: contentHtml,
    });
  }

  generateProviderNotificationEmail(data: ProviderNotificationEmailData): string {
    const providerNotificationTemplate = this.loadTemplate('provider-notification');
    const contentHtml = providerNotificationTemplate({
      ...data,
      adminPanelUrl: this.getBaseData().adminPanelUrl,
    });

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Upcoming Wine Experience - Guest Reminder',
      subtitle: `Reservation in ${data.hoursBeforeEvent} hours`,
      content: contentHtml,
    });
  }

  generateBookingConfirmationEmail(data: BookingEmailTemplateData): string {
    const bookingConfirmationTemplate = this.loadTemplate('booking-confirmation');
    const contentHtml = bookingConfirmationTemplate(data);

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Confirmation de réservation - Rose des Vins',
      subtitle: 'Votre dégustation est confirmée',
      content: contentHtml,
    });
  }

  generateBookingUpdateEmail(data: BookingEmailTemplateData): string {
    const bookingUpdateTemplate = this.loadTemplate('booking-update');
    const contentHtml = bookingUpdateTemplate(data);

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Modification de réservation - Rose des Vins',
      subtitle: 'Votre réservation a été modifiée',
      content: contentHtml,
    });
  }

  generateBookingCancellationEmail(data: BookingEmailTemplateData): string {
    const bookingCancellationTemplate = this.loadTemplate('booking-cancellation');
    const contentHtml = bookingCancellationTemplate(data);

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Annulation de réservation - Rose des Vins',
      subtitle: 'Votre réservation a été annulée',
      content: contentHtml,
    });
  }
}
