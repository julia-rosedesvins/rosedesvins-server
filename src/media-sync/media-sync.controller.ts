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
}
