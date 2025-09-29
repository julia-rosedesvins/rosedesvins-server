import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { UserBookingsService } from './user-bookings.service';
import { CreateBookingDto, CreateBookingSchema } from '../validators/user-bookings.validators';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';

@ApiTags('Bookings')
@Controller('bookings')
export class UserBookingsController {
  constructor(private readonly userBookingsService: UserBookingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new booking' })
  @ApiBody({
    description: 'Booking creation data',
    schema: {
      type: 'object',
      properties: {
        userId: { 
          type: 'string', 
          example: '60d0fe4f5311236168a109ca',
          description: 'ID of the user making the booking'
        },
        serviceId: { 
          type: 'string', 
          example: '60d0fe4f5311236168a109cb',
          description: 'ID of the service being booked'
        },
        bookingDate: { 
          type: 'string', 
          format: 'date',
          example: '2025-10-15',
          description: 'Date of the booking'
        },
        bookingTime: { 
          type: 'string', 
          example: '14:30',
          description: 'Time of the booking in HH:MM format'
        },
        participantsAdults: { 
          type: 'number', 
          example: 2,
          description: 'Number of adult participants'
        },
        participantsEnfants: { 
          type: 'number', 
          example: 1,
          description: 'Number of child participants'
        },
        selectedLanguage: { 
          type: 'string', 
          example: 'English',
          description: 'Preferred language for the service'
        },
        userContactFirstname: { 
          type: 'string', 
          example: 'John',
          description: 'Contact person first name'
        },
        userContactLastname: { 
          type: 'string', 
          example: 'Doe',
          description: 'Contact person last name'
        },
        phoneNo: { 
          type: 'string', 
          example: '+1234567890',
          description: 'Contact phone number'
        },
        additionalNotes: { 
          type: 'string', 
          example: 'Vegetarian dietary requirements',
          description: 'Any special requests or notes'
        },
        paymentMethod: {
          type: 'object',
          properties: {
            method: {
              type: 'string',
              enum: ['bank_card', 'cheque', 'stripe', 'cash_on_onsite'],
              example: 'bank_card',
              description: 'Payment method type'
            },
            bankCardDetails: {
              type: 'object',
              properties: {
                bankName: { type: 'string', example: 'Chase Bank' },
                accountName: { type: 'string', example: 'John Doe' },
                accountNumber: { type: 'string', example: '1234567890' }
              },
              description: 'Required when payment method is bank_card'
            },
            chequeDetails: {
              type: 'object',
              properties: {
                chequeNumber: { type: 'string', example: '0123456' },
                bankName: { type: 'string', example: 'Crédit Agricole' },
                issueDate: { type: 'string', format: 'date', example: '2025-09-29' }
              },
              description: 'Required when payment method is cheque'
            }
          },
          required: ['method']
        }
      },
      required: [
        'userId', 
        'serviceId', 
        'bookingDate', 
        'bookingTime', 
        'participantsAdults', 
        'participantsEnfants', 
        'selectedLanguage', 
        'userContactFirstname', 
        'userContactLastname', 
        'phoneNo', 
        'paymentMethod'
      ]
    }
  })
  async createBooking(
    @Body(new ZodValidationPipe(CreateBookingSchema)) createBookingDto: CreateBookingDto
  ) {
    return this.userBookingsService.createBooking(createBookingDto);
  }
}
