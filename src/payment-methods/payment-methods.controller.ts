import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentMethodsService } from './payment-methods.service';
import { UserGuard } from '../guards/user.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  CreateOrUpdatePaymentMethodsSchema,
  CreateOrUpdatePaymentMethodsDto
} from '../validators/payment-methods.validators';
import { PAYMENT_METHOD_OPTIONS } from '../schemas/payment-methods.schema';

@ApiTags('Payment Methods')
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post('create-or-update')
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Create or update payment methods',
    description: 'Creates new payment methods or updates existing ones for the current user'
  })
  @ApiBearerAuth('user-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        methods: { 
          type: 'array', 
          items: {
            type: 'string',
            enum: Object.values(PAYMENT_METHOD_OPTIONS)
          },
          example: [PAYMENT_METHOD_OPTIONS.BANK_CARD, PAYMENT_METHOD_OPTIONS.CASH],
          description: 'Array of selected payment methods',
          maxItems: 3,
          uniqueItems: true
        }
      },
      additionalProperties: false
    }
  })
  async createOrUpdatePaymentMethods(
    @Body(
      new ZodValidationPipe(CreateOrUpdatePaymentMethodsSchema)
    ) createOrUpdateDto: CreateOrUpdatePaymentMethodsDto,
    @CurrentUser() currentUser: any,
  ) {
    try {      
      const paymentMethods = await this.paymentMethodsService
        .createOrUpdatePaymentMethods(currentUser.sub, createOrUpdateDto);

      return {
        success: true,
        message: 'Payment methods saved successfully',
        data: paymentMethods.toObject(),
      };
    } catch (error) {
      throw error;
    }
  }

  @Get()
  @UseGuards(UserGuard)
  @ApiOperation({ 
    summary: 'Get payment methods',
    description: 'Retrieves payment methods for the current user'
  })
  @ApiBearerAuth('user-token')
  async getPaymentMethods(
    @CurrentUser() currentUser: any,
  ) {
    try {      
      const paymentMethods = await this.paymentMethodsService
        .getPaymentMethods(currentUser.sub);

      if (!paymentMethods) {
        return {
          success: true,
          message: 'No payment methods found for user',
          data: null,
        };
      }

      return {
        success: true,
        message: 'Payment methods retrieved successfully',
        data: paymentMethods.toObject(),
      };
    } catch (error) {
      throw error;
    }
  }
}
