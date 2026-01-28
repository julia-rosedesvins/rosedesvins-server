import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { S3Service } from '../common/services/s3.service';
import { UploadMediaDto } from './dto/upload-media.dto';

@Injectable()
export class MediaSyncService {
  private readonly logger = new Logger(MediaSyncService.name);

  constructor(private readonly s3Service: S3Service) {}

  async uploadMedia(
    file: Express.Multer.File,
    uploadDto: UploadMediaDto,
  ): Promise<{ url: string; key: string; message: string }> {
    try {
      if (!file) {
        throw new BadRequestException('No file provided');
      }

      this.logger.log(`Uploading file: ${file.originalname} (${file.size} bytes)`);

      const { url, key } = await this.s3Service.uploadFile(
        file,
        uploadDto.fileName,
        uploadDto.folder,
      );

      return {
        url,
        key,
        message: 'File uploaded successfully',
      };
    } catch (error) {
      this.logger.error(`Upload failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
