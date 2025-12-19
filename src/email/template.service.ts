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

export interface ResetPasswordEmailData {
  fullName: string;
  resetUrl: string;
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
  // Enhanced fields for booking-style template
  domainName?: string;
  domainAddress?: string;
  domainLogoUrl?: string;
  serviceName?: string;
  serviceDescription?: string;
  participantsAdults?: number;
  participantsChildren?: number;
  selectedLanguage?: string;
  numberOfWinesTasted?: number;
  totalPrice?: string;
  paymentMethod?: string;
  frontendUrl?: string;
  appLogoUrl?: string;
  backendUrl?: string;
  serviceBannerUrl?: string;
  cancelBookingUrl?: string;
  additionalNotes?: string;
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
  // Enhanced fields for booking-style template
  domainName?: string;
  domainAddress?: string;
  domainLogoUrl?: string;
  serviceName?: string;
  serviceDescription?: string;
  participantsAdults?: number;
  participantsChildren?: number;
  selectedLanguage?: string;
  numberOfWinesTasted?: number;
  totalPrice?: string;
  paymentMethod?: string;
  frontendUrl?: string;
  appLogoUrl?: string;
  backendUrl?: string;
  serviceBannerUrl?: string;
  customerEmail?: string;
  additionalNotes?: string;
  eventName?: string;
  providerTitle?: string;
}

export interface BookingEmailTemplateData {
  customerName: string;
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  eventTimezone: string;
  eventDuration: string;
  participantsAdults: number;
  participantsChildren: number;
  selectedLanguage: string;
  additionalNotes?: string;
  // Enhanced template fields
  domainName: string;
  domainAddress: string;
  domainLogoUrl: string;
  serviceName: string;
  serviceDescription: string;
  totalPrice: string;
  paymentMethod: string;
  frontendUrl: string;
  appLogoUrl: string;
  backendUrl: string;
  serviceBannerUrl: string;
}

@Injectable()
export class TemplateService {
  private templatesPath: string;
  private baseTemplate: handlebars.TemplateDelegate;

  constructor(private configService: ConfigService) {
    // Use the source path directly for development and production
    this.templatesPath = path.join(process.cwd(), 'src', 'email', 'templates', 'hbs');
    this.registerHandlebarsHelpers();
    this.loadBaseTemplate();
  }

  private registerHandlebarsHelpers() {
    // Helper for greater than comparison
    handlebars.registerHelper('gt', (a: number, b: number) => {
      return a > b;
    });

    // Helper for equality comparison
    handlebars.registerHelper('eq', (a: any, b: any) => {
      return a === b;
    });

    // Helper for logical AND
    handlebars.registerHelper('and', (a: any, b: any) => {
      return a && b;
    });

    // Helper for logical OR
    handlebars.registerHelper('or', (a: any, b: any) => {
      return a || b;
    });
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
      title: 'Bienvenue chez Rose des Vins',
      subtitle: 'Votre compte a été approuvé',
      content: contentHtml,
    });
  }

  generateResetPasswordEmail(data: ResetPasswordEmailData): string {
    const contentHtml = `
      <div style="text-align: center;">
        <h2>Réinitialisation de votre mot de passe</h2>
        <p>Bonjour ${data.fullName},</p>
        <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
        <p>Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :</p>
        <div style="margin: 30px 0;">
          <a href="${data.resetUrl}" style="background-color: #3A7B59; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Réinitialiser mon mot de passe</a>
        </div>
        <p>Ce lien est valide pendant 1 heure.</p>
        <p>Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet email.</p>
      </div>
    `;

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Réinitialisation de mot de passe',
      subtitle: 'Action requise',
      content: contentHtml,
    });
  }

  generateRejectionEmail(data: RejectionEmailData): string {
    const rejectionTemplate = this.loadTemplate('rejection');
    const contentHtml = rejectionTemplate(data);

    return this.baseTemplate({
      ...this.getBaseData(),
      title: 'Mise à jour du statut de la candidature',
      subtitle: 'Merci de votre intérêt',
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
      title: 'Nouvelle soumission de formulaire de contact',
      subtitle: 'Notification administrateur',
      content: contentHtml,
    });
  }

  generateCustomerNotificationEmail(data: CustomerNotificationEmailData): string {
    const customerNotificationTemplate = this.loadTemplate('customer-notification');
    return customerNotificationTemplate(data);
  }

  generateProviderNotificationEmail(data: ProviderNotificationEmailData): string {
    const providerNotificationTemplate = this.loadTemplate('provider-notification');
    return providerNotificationTemplate(data);
  }

  generateBookingConfirmationEmail(data: BookingEmailTemplateData): string {
    const bookingConfirmationTemplate = this.loadTemplate('booking-confirmation');
    return bookingConfirmationTemplate(data);
  }

  generateBookingUpdateEmail(data: BookingEmailTemplateData): string {
    const bookingUpdateTemplate = this.loadTemplate('booking-update');

    return bookingUpdateTemplate(data);
  }

  generateBookingCancellationEmail(data: BookingEmailTemplateData): string {
    const bookingCancellationTemplate = this.loadTemplate('booking-cancellation');
    
    return bookingCancellationTemplate(data);
  }
}
