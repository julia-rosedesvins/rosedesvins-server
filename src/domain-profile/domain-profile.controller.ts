import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpStatus,
  HttpException,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiResponse, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UserGuard } from '../guards/user.guard';
import { DomainProfileService } from './domain-profile.service';
import { z } from 'zod';
import { domainProfileImageOptions } from '../common/multer.config';
import { CreateOrUpdateDomainProfileSchema, CreateOrUpdateDomainProfileDto } from '../validators/domain-profile.validators';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { CurrentUser } from 'src/decorators/current-user.decorator';

@ApiTags('Domain Profiles')
@Controller('domain-profile')
export class DomainProfileController {
  constructor(private readonly domainProfileService: DomainProfileService) {}

  @Post('create-or-update')
  @UseGuards(UserGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'domainProfilePicture', maxCount: 1 },
    { name: 'domainLogo', maxCount: 1 }
  ], domainProfileImageOptions))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create or update domain profile for current user with file uploads' })
  @ApiBody({
    description: 'Domain profile data with optional file uploads',
    schema: {
      type: 'object',
      properties: {
        domainName: { type: 'string', minLength: 2, maxLength: 100 },
        domainDescription: { type: 'string', minLength: 10, maxLength: 2000 },
        domainType: { type: 'string', maxLength: 100 },
        domainTag: { type: 'string', maxLength: 100 },
        domainColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        domainProfilePicture: {
          type: 'string',
          format: 'binary',
          description: 'Domain profile picture file (JPEG, PNG, GIF, WebP, max 5MB)'
        },
        domainLogo: {
          type: 'string',
          format: 'binary',
          description: 'Domain logo file (JPEG, PNG, GIF, WebP, max 5MB)'
        },
        services: {
          type: 'string',
          description: 'JSON stringified array of services'
        }
      }
    }
  })
  async createOrUpdateDomainProfile(
    @Body() body: any,
    @UploadedFiles() files: { domainProfilePicture?: Express.Multer.File[], domainLogo?: Express.Multer.File[] },
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: {
      domainProfile: any;
      isNew: boolean;
    };
  }> {
    try {
      const userId = user.sub;

      // Parse services if provided as JSON string
      let parsedServices;
      if (body.services) {
        try {
          parsedServices = JSON.parse(body.services);
        } catch (error) {
          throw new HttpException('Invalid services JSON format', HttpStatus.BAD_REQUEST);
        }
      }

      // Files are already organized by FileFieldsInterceptor
      const organizedFiles = {
        domainProfilePicture: files?.domainProfilePicture,
        domainLogo: files?.domainLogo
      };

      // Prepare data for validation and service
      const domainProfileData = {
        domainName: body.domainName,
        domainDescription: body.domainDescription,
        domainType: body.domainType,
        domainTag: body.domainTag,
        domainColor: body.domainColor,
        services: parsedServices
      };

      // Validate the data (excluding files)
      const validatedData = CreateOrUpdateDomainProfileSchema.parse(domainProfileData);

      const result = await this.domainProfileService.createOrUpdateDomainProfile(
        userId,
        validatedData,
        organizedFiles
      );

      return {
        success: true,
        message: result.isNew ? 'Domain profile created successfully' : 'Domain profile updated successfully',
        data: result
      };
    } catch (error) {
      console.error('Error creating/updating domain profile:', error);
      if (error.name === 'ZodError') {
        throw new HttpException({
          message: 'Validation failed',
          errors: error.errors
        }, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @Get('me')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user domain profile with domain name' })
  async getCurrentUserDomainProfile(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;
      const domainProfile = await this.domainProfileService.getCurrentUserDomainProfile(userId);

      if (!domainProfile) {
        return {
          success: true,
          message: 'No domain profile found for current user',
          data: null
        };
      }

      return {
        success: true,
        message: 'Domain profile retrieved successfully',
        data: domainProfile
      };
    } catch (error) {
      console.error('Error retrieving domain profile:', error);
      throw error;
    }
  }
}
