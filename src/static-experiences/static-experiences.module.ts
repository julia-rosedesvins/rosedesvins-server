import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { StaticExperiencesService } from './static-experiences.service';
import { StaticExperiencesController } from './static-experiences.controller';
import { StaticExperience, StaticExperienceSchema } from '../schemas/static-experience.schema';
import { S3Service } from '../common/services/s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StaticExperience.name, schema: StaticExperienceSchema }]),
    JwtModule.register({}),
  ],
  controllers: [StaticExperiencesController],
  providers: [StaticExperiencesService, S3Service],
})
export class StaticExperiencesModule {}
