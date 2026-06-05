import { Injectable } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { TemplateService } from '../email/template.service';

const MOCK_IMAGE = 'https://rosedesvins.s3.us-east-1.amazonaws.com/regions/region_thumbnail_1777359713259.jpg';
const MOCK_FRONTEND_URL = 'https://rosedesvins.fr';
const MOCK_BACKEND_URL = 'https://api.rosedesvins.fr';
const MOCK_APP_LOGO = 'https://rosedesvins.s3.us-east-1.amazonaws.com/regions/region_thumbnail_1777359713259.jpg';

@Injectable()
export class EmailTestService {
  constructor(
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) {}

  // ─── Mock data builders ────────────────────────────────────────────────────

  private bookingMockData(to: string) {
    return {
      customerName: 'Jean Dupont',
      customerEmail: to,
      eventTitle: 'Dégustation Grands Crus Bordeaux',
      eventDate: '15 juin 2026',
      eventTime: '14h00',
      eventTimezone: 'Europe/Paris',
      eventDuration: '2 heures',
      participantsAdults: 2,
      participantsChildren: 1,
      selectedLanguage: 'Français',
      additionalNotes: 'Allergie aux sulfites à noter.',
      numberOfWinesTasted: 6,
      domainName: 'Domaine de la Rose',
      domainAddress: '12 Route des Vignes, 33000 Bordeaux',
      domainLogoUrl: MOCK_IMAGE,
      serviceName: 'Dégustation Grands Crus',
      serviceDescription: 'Une dégustation exclusive de 6 grands crus de Bordeaux accompagnée d\'une visite du chai.',
      totalPrice: '120,00 €',
      paymentMethod: 'Carte bancaire',
      frontendUrl: MOCK_FRONTEND_URL,
      appLogoUrl: MOCK_APP_LOGO,
      backendUrl: MOCK_BACKEND_URL,
      serviceBannerUrl: MOCK_IMAGE,
      cancelBookingUrl: `${MOCK_FRONTEND_URL}/cancel-booking/mock-booking-id`,
    };
  }

  private providerMockData(to: string) {
    return {
      ...this.bookingMockData(to),
      providerName: 'Marie Leclerc',
      providerEmail: to,
      providerTitle: 'Vigneronne',
      eventName: 'Dégustation Grands Crus Bordeaux',
    };
  }

  // ─── Senders ───────────────────────────────────────────────────────────────

  async sendWelcomeTest(to: string): Promise<void> {
    await this.emailService.sendWelcomeEmail({
      fullName: 'Jean Dupont',
      email: to,
      password: 'TempPass123!',
      domain: 'Domaine de la Rose',
    });
  }

  async sendRejectionTest(to: string): Promise<void> {
    await this.emailService.sendRejectionEmail({
      fullName: 'Jean Dupont',
      email: to,
      domain: 'Domaine de la Rose',
    });
  }

  async sendResetPasswordTest(to: string): Promise<void> {
    await this.emailService.sendResetPasswordEmail({
      fullName: 'Jean Dupont',
      email: to,
      resetUrl: `${MOCK_FRONTEND_URL}/reset-password?token=mock-token-abc123`,
    });
  }

  async sendContactFormTest(to: string): Promise<void> {
    await this.emailService.sendContactFormNotification({
      fullName: 'Jean Dupont',
      email: to,
      domain: 'Domaine de la Rose',
      message: 'Bonjour, je souhaite obtenir plus d\'informations sur vos services de dégustation.',
    });
  }

  async sendBookingConfirmationTest(to: string): Promise<void> {
    const html = this.templateService.generateBookingConfirmationEmail(this.bookingMockData(to));
    await this.emailService.sendEmail({
      to,
      subject: '[TEST] Confirmation de votre réservation',
      html,
    });
  }

  async sendBookingUpdateTest(to: string): Promise<void> {
    const html = this.templateService.generateBookingUpdateEmail(this.bookingMockData(to));
    await this.emailService.sendEmail({
      to,
      subject: '[TEST] Mise à jour de votre réservation',
      html,
    });
  }

  async sendBookingCancellationTest(to: string): Promise<void> {
    const html = this.templateService.generateBookingCancellationEmail(this.bookingMockData(to));
    await this.emailService.sendEmail({
      to,
      subject: '[TEST] Annulation de votre réservation',
      html,
    });
  }

  async sendProviderNotificationTest(to: string): Promise<void> {
    const html = this.templateService.generateProviderNotificationEmail({
      providerName: 'Marie Leclerc',
      providerEmail: to,
      customerName: 'Jean Dupont',
      customerEmail: 'jean.dupont@example.com',
      eventTitle: 'Dégustation Grands Crus Bordeaux',
      eventDate: '15 juin 2026',
      eventTime: '14h00',
      eventTimezone: 'Europe/Paris',
      eventDuration: '2 heures',
      hoursBeforeEvent: 24,
      domainName: 'Domaine de la Rose',
      domainAddress: '12 Route des Vignes, 33000 Bordeaux',
      domainLogoUrl: MOCK_IMAGE,
      serviceName: 'Dégustation Grands Crus',
      serviceDescription: 'Une dégustation exclusive de 6 grands crus de Bordeaux.',
      participantsAdults: 2,
      participantsChildren: 1,
      selectedLanguage: 'Français',
      numberOfWinesTasted: 6,
      totalPrice: '120,00 €',
      paymentMethod: 'Carte bancaire',
      frontendUrl: MOCK_FRONTEND_URL,
      appLogoUrl: MOCK_APP_LOGO,
      backendUrl: MOCK_BACKEND_URL,
      serviceBannerUrl: MOCK_IMAGE,
      additionalNotes: 'Allergie aux sulfites à noter.',
      eventName: 'Dégustation Grands Crus Bordeaux',
      providerTitle: 'Vigneronne',
    });
    await this.emailService.sendEmail({
      to,
      subject: '[TEST] Nouvelle réservation reçue',
      html,
    });
  }

  async sendProviderCancellationTest(to: string): Promise<void> {
    const html = this.templateService.generateProviderCancellationEmail(this.providerMockData(to));
    await this.emailService.sendEmail({
      to,
      subject: '[TEST] Annulation d\'une réservation',
      html,
    });
  }

  async sendCustomerNotificationTest(to: string): Promise<void> {
    const html = this.templateService.generateCustomerNotificationEmail({
      customerName: 'Jean Dupont',
      customerEmail: to,
      eventTitle: 'Dégustation Grands Crus Bordeaux',
      eventDate: '15 juin 2026',
      eventTime: '14h00',
      eventTimezone: 'Europe/Paris',
      eventDuration: '2 heures',
      hoursBeforeEvent: 24,
      domainName: 'Domaine de la Rose',
      domainAddress: '12 Route des Vignes, 33000 Bordeaux',
      domainLogoUrl: MOCK_IMAGE,
      serviceName: 'Dégustation Grands Crus',
      serviceDescription: 'Une dégustation exclusive de 6 grands crus de Bordeaux.',
      participantsAdults: 2,
      participantsChildren: 1,
      selectedLanguage: 'Français',
      numberOfWinesTasted: 6,
      totalPrice: '120,00 €',
      paymentMethod: 'Carte bancaire',
      frontendUrl: MOCK_FRONTEND_URL,
      appLogoUrl: MOCK_APP_LOGO,
      backendUrl: MOCK_BACKEND_URL,
      serviceBannerUrl: MOCK_IMAGE,
      cancelBookingUrl: `${MOCK_FRONTEND_URL}/cancel-booking/mock-booking-id`,
      additionalNotes: 'Allergie aux sulfites à noter.',
    });
    await this.emailService.sendEmail({
      to,
      subject: '[TEST] Rappel de votre prochaine réservation',
      html,
    });
  }

  async sendSubscriptionExpiryWarningTest(to: string): Promise<void> {
    await this.emailService.sendSubscriptionExpiryWarning({
      userFullName: 'Jean Dupont',
      userEmail: to,
      domainName: 'Domaine de la Rose',
      expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
  }
}
