import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsController } from './payment-methods.controller';
import { StripeConnectService } from './stripe-connect.service';
import { PaymentMethods, PaymentMethodsSchema } from '../schemas/payment-methods.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: PaymentMethods.name, schema: PaymentMethodsSchema }
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService, StripeConnectService],
  exports: [PaymentMethodsService, StripeConnectService],
})
export class PaymentMethodsModule {}
