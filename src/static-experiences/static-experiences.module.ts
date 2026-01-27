import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StaticExperiencesService } from './static-experiences.service';
import { StaticExperiencesController } from './static-experiences.controller';
import { StaticExperience, StaticExperienceSchema } from '../schemas/static-experience.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: StaticExperience.name, schema: StaticExperienceSchema }])
  ],
  controllers: [StaticExperiencesController],
  providers: [StaticExperiencesService],
})
export class StaticExperiencesModule {}
