import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { RegionsService } from './regions.service';
import { RegionsController } from './regions.controller';
import { Region, RegionSchema } from '../schemas/region.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { StaticExperience, StaticExperienceSchema } from '../schemas/static-experience.schema';
import { Availability, AvailabilitySchema } from '../schemas/availability.schema';
import { S3Service } from '../common/services/s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Region.name, schema: RegionSchema },
      { name: User.name, schema: UserSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: StaticExperience.name, schema: StaticExperienceSchema },
      { name: Availability.name, schema: AvailabilitySchema },
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [RegionsController],
  providers: [RegionsService, S3Service],
  exports: [RegionsService],
})
export class RegionsModule {}
