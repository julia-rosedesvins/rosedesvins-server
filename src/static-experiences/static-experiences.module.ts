import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { StaticExperiencesService } from './static-experiences.service';
import { StaticExperiencesController } from './static-experiences.controller';
import { StaticExperience, StaticExperienceSchema } from '../schemas/static-experience.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { S3Service } from '../common/services/s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StaticExperience.name, schema: StaticExperienceSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
    ]),
    JwtModule.register({}),
  ],
  controllers: [StaticExperiencesController],
  providers: [StaticExperiencesService, S3Service],
})
export class StaticExperiencesModule {}
