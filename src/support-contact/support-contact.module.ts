import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SupportContactService } from './support-contact.service';
import { SupportContactController } from './support-contact.controller';
import { SupportContact, SupportContactSchema } from '../schemas/support-contact.schema';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SupportContact.name, schema: SupportContactSchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [SupportContactController],
  providers: [SupportContactService],
  exports: [SupportContactService],
})
export class SupportContactModule {}
