import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DomainProfileService } from './domain-profile.service';
import { DomainProfileController } from './domain-profile.controller';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { JwtModule } from '@nestjs/jwt';
import { S3Service } from '../common/services/s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: User.name, schema: UserSchema }
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [DomainProfileController],
  providers: [DomainProfileService, S3Service],
  exports: [DomainProfileService]
})
export class DomainProfileModule { }
