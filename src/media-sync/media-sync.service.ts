import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { S3Service } from '../common/services/s3.service';
import { UploadMediaDto } from './dto/upload-media.dto';
import { SyncStaticExperienceImagesDto, SyncStaticExperienceImagesResponseDto } from './dto/sync-static-experience-images.dto';
import { StaticExperience } from '../schemas/static-experience.schema';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class MediaSyncService {
  private readonly logger = new Logger(MediaSyncService.name);

  constructor(
    private readonly s3Service: S3Service,
    @InjectModel(StaticExperience.name) private staticExperienceModel: Model<StaticExperience>,
  ) {}

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

  async syncStaticExperienceImages(
    dto: SyncStaticExperienceImagesDto,
  ): Promise<SyncStaticExperienceImagesResponseDto> {
    const { imagesDirectory } = dto;
    const errors: Array<{ id: string; error: string }> = [];
    let successfulUploads = 0;
    let totalProcessed = 0;

    try {
      this.logger.log(`Starting image sync from directory: ${imagesDirectory}`);

      // Read all files from the directory
      const files = await fs.readdir(imagesDirectory);
      const imageFiles = files.filter(file => file.endsWith('.webp'));

      this.logger.log(`Found ${imageFiles.length} image files to process`);

      // Process images in batches to avoid overwhelming the system
      const batchSize = 50;
      for (let i = 0; i < imageFiles.length; i += batchSize) {
        const batch = imageFiles.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (fileName) => {
            try {
              // Extract the _id from filename (remove .webp extension)
              const experienceId = fileName.replace('.webp', '');
              totalProcessed++;

              this.logger.log(`Processing ${totalProcessed}/${imageFiles.length}: ${experienceId}`);

              // Check if the static experience exists
              const experience = await this.staticExperienceModel.findById(experienceId);
              
              if (!experience) {
                errors.push({
                  id: experienceId,
                  error: 'Static experience not found in database',
                });
                return;
              }

              // Read the image file
              const filePath = path.join(imagesDirectory, fileName);
              const fileBuffer = await fs.readFile(filePath);

              // Upload to S3
              const { url } = await this.s3Service.uploadFile(
                fileBuffer,
                fileName,
                'static-experiences',
              );

              // Update the database
              await this.staticExperienceModel.findByIdAndUpdate(
                experienceId,
                { main_image: url },
                { new: true },
              );

              successfulUploads++;
              this.logger.log(`Successfully uploaded and updated: ${experienceId}`);
            } catch (error) {
              const experienceId = fileName.replace('.webp', '');
              this.logger.error(`Failed to process ${experienceId}: ${error.message}`);
              errors.push({
                id: experienceId,
                error: error.message,
              });
            }
          }),
        );

        this.logger.log(`Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(imageFiles.length / batchSize)} completed`);
      }

      const response: SyncStaticExperienceImagesResponseDto = {
        success: true,
        totalProcessed,
        successfulUploads,
        failedUploads: errors.length,
        errors,
      };

      this.logger.log(
        `Image sync completed: ${successfulUploads}/${totalProcessed} successful, ${errors.length} failed`,
      );

      return response;
    } catch (error) {
      this.logger.error(`Image sync failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Image sync failed: ${error.message}`);
    }
  }
}
