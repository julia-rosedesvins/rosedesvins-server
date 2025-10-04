import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
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
import { ServiceSchema, UpdateServiceSchema } from '../validators/service.validators';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { CurrentUser } from 'src/decorators/current-user.decorator';

@ApiTags('Domain Profiles')
@Controller('domain-profile')
export class DomainProfileController {
  constructor(private readonly domainProfileService: DomainProfileService) {}

  /**
   * Helper method to parse array data from FormData
   */
  private parseArrayFromFormData(data: any, key: string): string[] {
    // Handle array sent as key[] format
    if (data[`${key}[]`]) {
      return Array.isArray(data[`${key}[]`]) ? data[`${key}[]`] : [data[`${key}[]`]];
    }
    // Handle direct array
    if (Array.isArray(data[key])) {
      return data[key];
    }
    // Handle single value
    if (data[key]) {
      return [data[key]];
    }
    return [];
  }

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

      // Files are already organized by FileFieldsInterceptor
      const organizedFiles = {
        domainProfilePicture: files?.domainProfilePicture,
        domainLogo: files?.domainLogo
      };

      // Prepare data for validation and service (exclude services from main validation)
      const domainProfileData = {
        domainName: body.domainName,
        domainDescription: body.domainDescription,
        domainType: body.domainType,
        domainTag: body.domainTag,
        domainColor: body.domainColor,
        // Remove services from here as they'll be managed separately
      };

      console.log('Domain profile data for validation:', JSON.stringify(domainProfileData, null, 2));

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
          success: false,
          message: 'Validation failed',
          errors: error.errors?.map(err => ({
            field: err.path?.join('.') || 'unknown',
            message: err.message,
            value: err.input
          })) || []
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

  // Service Management Endpoints
  @Post('services/add')
  @UseGuards(UserGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'serviceBanner', maxCount: 1 }
  ], domainProfileImageOptions))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Add a new service to domain profile with optional banner upload' })
  @ApiBody({
    description: 'Service data with optional banner file',
    schema: {
      type: 'object',
      properties: {
        serviceName: { type: 'string', minLength: 2, maxLength: 200 },
        serviceDescription: { type: 'string', minLength: 10, maxLength: 2000 },
        numberOfPeople: { type: 'number', minimum: 1 },
        pricePerPerson: { type: 'number', minimum: 0 },
        timeOfServiceInMinutes: { type: 'number', minimum: 1 },
        numberOfWinesTasted: { type: 'number', minimum: 0 },
        languagesOffered: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10
        },
        isActive: { type: 'boolean', default: true },
        serviceBanner: {
          type: 'string',
          format: 'binary',
          description: 'Service banner image file'
        }
      }
    }
  })
  async addService(
    @Body() serviceData: any,
    @UploadedFiles() files: { serviceBanner?: Express.Multer.File[] },
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;

      // Parse numeric fields from FormData strings
      const parsedServiceData = {
        ...serviceData,
        numberOfPeople: parseInt(serviceData.numberOfPeople),
        pricePerPerson: parseFloat(serviceData.pricePerPerson),
        timeOfServiceInMinutes: parseInt(serviceData.timeOfServiceInMinutes),
        numberOfWinesTasted: parseInt(serviceData.numberOfWinesTasted),
        isActive: serviceData.isActive === 'true' || serviceData.isActive === true,
        languagesOffered: this.parseArrayFromFormData(serviceData, 'languagesOffered')
      };

      const validatedService = ServiceSchema.parse(parsedServiceData);

      const result = await this.domainProfileService.addService(userId, validatedService, files);

      return {
        success: true,
        message: 'Service added successfully',
        data: result
      };
    } catch (error) {
      if (error.name === 'ZodError') {
        throw new HttpException({
          success: false,
          message: 'Service validation failed',
          errors: error.errors?.map(err => ({
            field: err.path?.join('.') || 'unknown',
            message: err.message,
            value: err.input
          })) || []
        }, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @Get('services')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all services for current user domain profile' })
  async getServices(
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any[];
  }> {
    try {
      const userId = user.sub;
      const services = await this.domainProfileService.getServices(userId);

      return {
        success: true,
        message: 'Services retrieved successfully',
        data: services
      };
    } catch (error) {
      console.error('Error retrieving services:', error);
      throw error;
    }
  }

  @Put('services/:serviceIndex')
  @UseGuards(UserGuard)
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'serviceBanner', maxCount: 1 }
  ], domainProfileImageOptions))
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update a service by index with optional banner upload' })
  @ApiBody({
    description: 'Updated service data with optional banner file',
    schema: {
      type: 'object',
      properties: {
        serviceName: { type: 'string', minLength: 2, maxLength: 100 },
        serviceDescription: { type: 'string', minLength: 10, maxLength: 1000 },
        numberOfPeople: { type: 'integer', minimum: 1, maximum: 100 },
        pricePerPerson: { type: 'number', minimum: 0, maximum: 10000 },
        timeOfServiceInMinutes: { type: 'integer', minimum: 15, maximum: 1440 },
        numberOfWinesTasted: { type: 'integer', minimum: 0 },
        languagesOffered: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
          maxItems: 10
        },
        isActive: { type: 'boolean' },
        serviceBanner: {
          type: 'string',
          format: 'binary',
          description: 'Service banner image file'
        }
      }
    }
  })
  async updateService(
    @Param('serviceIndex') serviceIndex: string,
    @Body() serviceData: any,
    @UploadedFiles() files: { serviceBanner?: Express.Multer.File[] },
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;
      const index = parseInt(serviceIndex);
      
      if (isNaN(index) || index < 0) {
        throw new HttpException('Invalid service index', HttpStatus.BAD_REQUEST);
      }

      // Parse numeric fields from FormData strings
      const parsedServiceData = {
        ...serviceData,
        numberOfPeople: serviceData.numberOfPeople ? parseInt(serviceData.numberOfPeople) : undefined,
        pricePerPerson: serviceData.pricePerPerson ? parseFloat(serviceData.pricePerPerson) : undefined,
        timeOfServiceInMinutes: serviceData.timeOfServiceInMinutes ? parseInt(serviceData.timeOfServiceInMinutes) : undefined,
        numberOfWinesTasted: serviceData.numberOfWinesTasted ? parseInt(serviceData.numberOfWinesTasted) : undefined,
        isActive: serviceData.isActive !== undefined ? (serviceData.isActive === 'true' || serviceData.isActive === true) : undefined,
        languagesOffered: serviceData.languagesOffered || serviceData['languagesOffered[]'] 
          ? this.parseArrayFromFormData(serviceData, 'languagesOffered') 
          : undefined
      };

      // Remove undefined values
      Object.keys(parsedServiceData).forEach(key => 
        parsedServiceData[key] === undefined && delete parsedServiceData[key]
      );

      // Validate service data using the imported UpdateServiceSchema
      const validatedService = UpdateServiceSchema.parse(parsedServiceData);

      console.log('Validated update service data:', JSON.stringify(validatedService, null, 2));
      const result = await this.domainProfileService.updateService(userId, index, validatedService, files);

      return {
        success: true,
        message: 'Service updated successfully',
        data: result
      };
    } catch (error) {
      console.error('Error updating service:', error);
      if (error.name === 'ZodError') {
        throw new HttpException({
          success: false,
          message: 'Service validation failed',
          errors: error.errors?.map(err => ({
            field: err.path?.join('.') || 'unknown',
            message: err.message,
            value: err.input
          })) || []
        }, HttpStatus.BAD_REQUEST);
      }
      throw error;
    }
  }

  @Delete('services/:serviceIndex')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a service by index' })
  async deleteService(
    @Param('serviceIndex') serviceIndex: string,
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const userId = user.sub;
      const index = parseInt(serviceIndex);
      
      if (isNaN(index) || index < 0) {
        throw new HttpException('Invalid service index', HttpStatus.BAD_REQUEST);
      }

      await this.domainProfileService.deleteService(userId, index);

      return {
        success: true,
        message: 'Service deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting service:', error);
      throw error;
    }
  }

  @Put('services/:serviceIndex/toggle-active')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle service active status' })
  async toggleServiceActive(
    @Param('serviceIndex') serviceIndex: string,
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;
      const index = parseInt(serviceIndex);
      
      if (isNaN(index) || index < 0) {
        throw new HttpException('Invalid service index', HttpStatus.BAD_REQUEST);
      }

      const result = await this.domainProfileService.toggleServiceActive(userId, index);

      return {
        success: true,
        message: 'Service status updated successfully',
        data: result
      };
    } catch (error) {
      console.error('Error toggling service status:', error);
      throw error;
    }
  }
}
