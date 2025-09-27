import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PaymentMethodsService } from './payment-methods.service';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethods, PaymentMethodsSchema } from '../schemas/payment-methods.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PaymentMethods.name, schema: PaymentMethodsSchema }
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [PaymentMethodsController],
  providers: [PaymentMethodsService],
  exports: [PaymentMethodsService], // Export service for use in other modules
})
export class PaymentMethodsModule {}
