import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger';
import { MediaSyncService } from './media-sync.service';
import { uploadMediaSchema, UploadMediaDto } from './dto/upload-media.dto';
import { UploadMediaResponseDto } from './dto/upload-media-response.dto';
import { syncStaticExperienceImagesSchema, SyncStaticExperienceImagesDto, SyncStaticExperienceImagesResponseDto } from './dto/sync-static-experience-images.dto';

@ApiTags('Media Sync')
@Controller('media-sync')
export class MediaSyncController {
  constructor(private readonly mediaSyncService: MediaSyncService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload a file to S3' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'The file to upload',
        },
        folder: {
          type: 'string',
          description: 'Optional folder path in S3',
          example: 'images/profiles',
        },
        fileName: {
          type: 'string',
          description: 'Optional custom file name (without extension)',
          example: 'profile-image',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'https://rosedesvins.s3.us-east-1.amazonaws.com/images/profiles/abc123.jpg' },
        key: { type: 'string', example: 'images/profiles/abc123.jpg' },
        message: { type: 'string', example: 'File uploaded successfully' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - No file provided or invalid file',
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: any,
  ): Promise<UploadMediaResponseDto> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate body with Zod
    const uploadDto = uploadMediaSchema.parse(body);

    return this.mediaSyncService.uploadMedia(file, uploadDto);
  }

  @Post('sync-static-experience-images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Sync static experience images from local directory to S3',
    description: 'Reads images from the local directory, uploads them to S3, and updates the main_image field in the database. Image filenames should be in format {_id}.webp'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imagesDirectory: {
          type: 'string',
          description: 'Path to the directory containing images',
          example: '/home/bikter/upwork/rosedesvins/docs/transformed_images-20260129T055134Z-3-001/transformed_images',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Image sync completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        totalProcessed: { type: 'number', example: 4644 },
        successfulUploads: { type: 'number', example: 4600 },
        failedUploads: { type: 'number', example: 44 },
        errors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: '6978a328cb4507233a2512a2' },
              error: { type: 'string', example: 'Static experience not found in database' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid directory or sync failed',
  })
  async syncStaticExperienceImages(
    @Body() body: any,
  ): Promise<SyncStaticExperienceImagesResponseDto> {
    // Validate body with Zod
    const dto = syncStaticExperienceImagesSchema.parse(body);

    return this.mediaSyncService.syncStaticExperienceImages(dto);
  }
}
