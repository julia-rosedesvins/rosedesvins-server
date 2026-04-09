import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { StripeCheckoutService } from './stripe-checkout.service';
import { StripeCheckoutController } from './stripe-checkout.controller';
import { Transaction, TransactionSchema } from '../schemas/transaction.schema';
import { UserBooking, UserBookingSchema } from '../schemas/user-bookings.schema';
import { PaymentMethods, PaymentMethodsSchema } from '../schemas/payment-methods.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Transaction.name, schema: TransactionSchema },
      { name: UserBooking.name, schema: UserBookingSchema },
      { name: PaymentMethods.name, schema: PaymentMethodsSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [StripeCheckoutController],
  providers: [StripeCheckoutService],
  exports: [StripeCheckoutService],
})
export class StripeCheckoutModule {}
