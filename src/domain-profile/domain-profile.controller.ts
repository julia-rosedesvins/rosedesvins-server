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
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            value: err.input
          }))
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
  @Post('services')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add a new service to current user domain profile' })
  @ApiBody({
    description: 'Service data',
    schema: {
      type: 'object',
      required: ['serviceName', 'serviceDescription', 'numberOfPeople', 'pricePerPerson', 'timeOfServiceInMinutes', 'numberOfWinesTasted', 'languagesOffered'],
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
        isActive: { type: 'boolean', default: true }
      }
    }
  })
  async addService(
    @Body() serviceData: any,
    @CurrentUser() user: any
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }> {
    try {
      const userId = user.sub;

      // Validate service data
      const serviceSchema = z.object({
        serviceName: z.string().min(2).max(100).trim(),
        serviceDescription: z.string().min(10).max(1000).trim(),
        numberOfPeople: z.number().int().min(1).max(100),
        pricePerPerson: z.number().min(0).max(10000),
        timeOfServiceInMinutes: z.number().int().min(15).max(1440),
        numberOfWinesTasted: z.number().int().min(0),
        languagesOffered: z.array(z.string().min(2)).min(1).max(10),
        isActive: z.boolean().default(true)
      });

      const validatedService = serviceSchema.parse(serviceData);
      const result = await this.domainProfileService.addService(userId, validatedService);

      return {
        success: true,
        message: 'Service added successfully',
        data: result
      };
    } catch (error) {
      console.error('Error adding service:', error);
      if (error.name === 'ZodError') {
        throw new HttpException({
          success: false,
          message: 'Service validation failed',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            value: err.input
          }))
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update a service by index' })
  @ApiBody({
    description: 'Updated service data',
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
        isActive: { type: 'boolean' }
      }
    }
  })
  async updateService(
    @Param('serviceIndex') serviceIndex: string,
    @Body() serviceData: any,
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

      // Validate service data (all fields optional for updates)
      const serviceSchema = z.object({
        serviceName: z.string().min(2).max(100).trim().optional(),
        serviceDescription: z.string().min(10).max(1000).trim().optional(),
        numberOfPeople: z.number().int().min(1).max(100).optional(),
        pricePerPerson: z.number().min(0).max(10000).optional(),
        timeOfServiceInMinutes: z.number().int().min(15).max(1440).optional(),
        numberOfWinesTasted: z.number().int().min(0).optional(),
        languagesOffered: z.array(z.string().min(2)).min(1).max(10).optional(),
        isActive: z.boolean().optional()
      });

      const validatedService = serviceSchema.parse(serviceData);
      const result = await this.domainProfileService.updateService(userId, index, validatedService);

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
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            value: err.input
          }))
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
