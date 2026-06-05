import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailTestService } from './email-test.service';
import { SendTestEmailDto, SendTestEmailSchema } from './dto/send-test-email.dto';
import { ZodValidationPipe } from './zod-validation.pipe';

const emailBodySchema = { schema: { type: 'object', required: ['to'], properties: { to: { type: 'string', format: 'email', example: 'test@example.com' } } } };

@ApiTags('Email Testing')
@Controller('v1/email-test')
@UsePipes(new ZodValidationPipe(SendTestEmailSchema))
export class EmailTestController {
  constructor(private readonly emailTestService: EmailTestService) {}

  @Post('welcome')
  @ApiOperation({ summary: 'Test: Welcome email', description: 'Sends a welcome email with mock data (new domain owner account approved).' })
  @ApiBody(emailBodySchema)
  async sendWelcome(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendWelcomeTest(dto.to);
    return { success: true, message: `Welcome email sent to ${dto.to}` };
  }

  @Post('rejection')
  @ApiOperation({ summary: 'Test: Rejection email', description: 'Sends a rejection email with mock data (registration request rejected).' })
  @ApiBody(emailBodySchema)
  async sendRejection(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendRejectionTest(dto.to);
    return { success: true, message: `Rejection email sent to ${dto.to}` };
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Test: Reset password email', description: 'Sends a password reset email with a mock reset URL.' })
  @ApiBody(emailBodySchema)
  async sendResetPassword(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendResetPasswordTest(dto.to);
    return { success: true, message: `Reset password email sent to ${dto.to}` };
  }

  @Post('contact-form')
  @ApiOperation({ summary: 'Test: Contact form notification email', description: 'Sends a contact form notification email (admin-facing) with mock data.' })
  @ApiBody(emailBodySchema)
  async sendContactForm(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendContactFormTest(dto.to);
    return { success: true, message: `Contact form email sent to ${dto.to}` };
  }

  @Post('booking-confirmation')
  @ApiOperation({ summary: 'Test: Booking confirmation email (customer)', description: 'Sends a booking confirmation email to the customer with full mock booking data.' })
  @ApiBody(emailBodySchema)
  async sendBookingConfirmation(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendBookingConfirmationTest(dto.to);
    return { success: true, message: `Booking confirmation email sent to ${dto.to}` };
  }

  @Post('booking-update')
  @ApiOperation({ summary: 'Test: Booking update email (customer)', description: 'Sends a booking update email to the customer with mock updated booking data.' })
  @ApiBody(emailBodySchema)
  async sendBookingUpdate(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendBookingUpdateTest(dto.to);
    return { success: true, message: `Booking update email sent to ${dto.to}` };
  }

  @Post('booking-cancellation')
  @ApiOperation({ summary: 'Test: Booking cancellation email (customer)', description: 'Sends a booking cancellation email to the customer with mock data.' })
  @ApiBody(emailBodySchema)
  async sendBookingCancellation(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendBookingCancellationTest(dto.to);
    return { success: true, message: `Booking cancellation email sent to ${dto.to}` };
  }

  @Post('provider-notification')
  @ApiOperation({ summary: 'Test: Provider notification email', description: 'Sends a new booking notification email to the provider (domain owner) with mock data.' })
  @ApiBody(emailBodySchema)
  async sendProviderNotification(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendProviderNotificationTest(dto.to);
    return { success: true, message: `Provider notification email sent to ${dto.to}` };
  }

  @Post('provider-cancellation')
  @ApiOperation({ summary: 'Test: Provider cancellation notification email', description: 'Sends a booking cancellation notification to the provider with mock data.' })
  @ApiBody(emailBodySchema)
  async sendProviderCancellation(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendProviderCancellationTest(dto.to);
    return { success: true, message: `Provider cancellation email sent to ${dto.to}` };
  }

  @Post('customer-notification')
  @ApiOperation({ summary: 'Test: Customer reminder notification email', description: 'Sends a pre-event reminder email to the customer with mock data.' })
  @ApiBody(emailBodySchema)
  async sendCustomerNotification(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendCustomerNotificationTest(dto.to);
    return { success: true, message: `Customer notification email sent to ${dto.to}` };
  }

  @Post('subscription-expiry-warning')
  @ApiOperation({ summary: 'Test: Subscription expiry warning email (admin)', description: 'Sends a subscription expiry warning email to the admin with mock data.' })
  @ApiBody(emailBodySchema)
  async sendSubscriptionExpiryWarning(@Body() dto: SendTestEmailDto) {
    await this.emailTestService.sendSubscriptionExpiryWarningTest(dto.to);
    return { success: true, message: `Subscription expiry warning email sent to ${dto.to}` };
  }
}
