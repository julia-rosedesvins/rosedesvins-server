import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ExperienceCategoriesService } from './experience-categories.service';
import { ExperienceCategoriesController } from './experience-categories.controller';
import { ExperienceCategory, ExperienceCategorySchema } from '../schemas/experience-category.schema';
import { S3Service } from '../common/services/s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ExperienceCategory.name, schema: ExperienceCategorySchema }]),
    JwtModule.register({}),
  ],
  controllers: [ExperienceCategoriesController],
  providers: [ExperienceCategoriesService, S3Service],
  exports: [ExperienceCategoriesService],
})
export class ExperienceCategoriesModule {}
