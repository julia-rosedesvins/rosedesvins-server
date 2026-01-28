import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MediaSyncController } from './media-sync.controller';
import { MediaSyncService } from './media-sync.service';
import { S3Service } from '../common/services/s3.service';

@Module({
  imports: [ConfigModule],
  controllers: [MediaSyncController],
  providers: [MediaSyncService, S3Service],
  exports: [MediaSyncService, S3Service],
})
export class MediaSyncModule {}
