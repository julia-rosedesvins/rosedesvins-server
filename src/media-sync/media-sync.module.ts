import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MediaSyncController } from './media-sync.controller';
import { MediaSyncService } from './media-sync.service';
import { S3Service } from '../common/services/s3.service';
import { StaticExperience, StaticExperienceSchema } from '../schemas/static-experience.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: StaticExperience.name, schema: StaticExperienceSchema },
    ]),
  ],
  controllers: [MediaSyncController],
  providers: [MediaSyncService, S3Service],
  exports: [MediaSyncService, S3Service],
})
export class MediaSyncModule {}
