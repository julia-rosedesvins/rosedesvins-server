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

export interface ResetPasswordEmailData {
  fullName: string;
  email: string;
  resetUrl: string;
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

  async sendResetPasswordEmail(data: ResetPasswordEmailData): Promise<void> {
    const emailJob: EmailJob = {
      to: data.email,
      subject: 'Réinitialisation de votre mot de passe - Rose des Vins',
      html: this.templateService.generateResetPasswordEmail({
        fullName: data.fullName,
        resetUrl: data.resetUrl,
      }),
    };

    await this.sendEmail(emailJob);
    this.logger.log(`Reset password email sent to ${data.email}`);
  }

  async sendNewSubscriptionNotification(email: string): Promise<void> {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@rosedesvins.com';
    
    const emailJob: EmailJob = {
      to: adminEmail,
      subject: `Nouvelle souscription newsletter - ${email}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #318160;">Nouvelle souscription newsletter</h2>
          <p>Une nouvelle demande de souscription a été reçue :</p>
          <p><strong>Email:</strong> ${email}</p>
          <p>Veuillez vous connecter à l'administration pour approuver ou rejeter cette demande.</p>
        </div>
      `,
    };
    
    await this.sendEmail(emailJob);
    this.logger.log(`Subscription notification sent to admin for ${email}`);
  }

  async sendUserApprovalEmail(
    email: string,
    firstName: string,
    lastName: string,
    tempPassword: string,
  ): Promise<void> {
    const loginUrl = process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/login` : 'http://localhost:3000/login';
    
    const emailJob: EmailJob = {
      to: email,
      subject: 'Bienvenue chez Rose des Vins - Votre compte a été créé ! 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #318160;">Bienvenue ${firstName} ${lastName} !</h2>
          <p>Votre demande d'inscription à Rose des Vins a été approuvée et votre compte a été créé avec succès.</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #318160;">Vos identifiants de connexion :</h3>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Mot de passe temporaire:</strong> <code style="background-color: #fff; padding: 5px 10px; border-radius: 3px;">${tempPassword}</code></p>
          </div>

          <p><strong>Important:</strong> Pour des raisons de sécurité, vous devrez changer votre mot de passe lors de votre première connexion.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #318160; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Se connecter</a>
          </div>

          <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
          
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Cordialement,<br>
            L'équipe Rose des Vins
          </p>
        </div>
      `,
    };

    await this.sendEmail(emailJob);
    this.logger.log(`Approval email sent to ${email}`);
  }

  async sendSubscriptionRejectionEmail(email: string, reason: string): Promise<void> {
    const emailJob: EmailJob = {
      to: email,
      subject: 'Rose des Vins - Mise à jour de votre demande',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #318160;">Mise à jour de votre demande</h2>
          <p>Nous avons examiné votre demande d'inscription à Rose des Vins.</p>
          <p>Malheureusement, nous ne pouvons pas donner suite à votre demande pour le moment.</p>
          ${reason ? `<p><strong>Raison:</strong> ${reason}</p>` : ''}
          <p>Si vous pensez qu'il s'agit d'une erreur ou si vous avez des questions, n'hésitez pas à nous contacter.</p>
          <p style="color: #666; font-size: 12px; margin-top: 30px;">
            Cordialement,<br>
            L'équipe Rose des Vins
          </p>
        </div>
      `,
    };

    await this.sendEmail(emailJob);
    this.logger.log(`Rejection email sent to ${email}`);
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
