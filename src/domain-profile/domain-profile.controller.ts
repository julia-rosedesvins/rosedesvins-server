import { Body, Controller, Post, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import { DomainProfileService } from './domain-profile.service';
import { UserGuard } from '../guards/user.guard';
import { CreateOrUpdateDomainProfileSchema, CreateOrUpdateDomainProfileDto } from '../validators/domain-profile.validators';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { CurrentUser } from 'src/decorators/current-user.decorator';

@ApiTags('Domain Profiles')
@Controller('domain-profile')
export class DomainProfileController {
  constructor(private readonly domainProfileService: DomainProfileService) {}

  @Post('create-or-update')
  @UseGuards(UserGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or update domain profile for current user' })
  @ApiBody({
    description: 'Domain profile data including domain name, description, URLs, color code, and services array',
    schema: {
      type: 'object',
      required: ['domainName', 'domainDescription', 'colorCode', 'services'],
      properties: {
        domainName: { type: 'string', minLength: 2, maxLength: 100 },
        domainDescription: { type: 'string', minLength: 10, maxLength: 2000 },
        domainProfilePictureUrl: { type: 'string', format: 'uri', nullable: true },
        domainLogoUrl: { type: 'string', format: 'uri', nullable: true },
        colorCode: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        services: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            required: ['name', 'description', 'numberOfPeople', 'pricePerPerson', 'timeOfServiceInMinutes', 'numberOfWinesTasted', 'languagesOffered', 'isActive'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 200 },
              description: { type: 'string', minLength: 10, maxLength: 1000 },
              numberOfPeople: { type: 'integer', minimum: 1, maximum: 100 },
              pricePerPerson: { type: 'number', minimum: 0, maximum: 10000 },
              timeOfServiceInMinutes: { type: 'integer', minimum: 15, maximum: 720 },
              numberOfWinesTasted: { type: 'integer', minimum: 0, maximum: 100 },
              languagesOffered: {
                type: 'array',
                items: { type: 'string' },
                minItems: 1,
                maxItems: 20
              },
              isActive: { type: 'boolean' }
            }
          }
        }
      }
    }
  })
  async createOrUpdateDomainProfile(
    @Body(new ZodValidationPipe(CreateOrUpdateDomainProfileSchema)) createOrUpdateDto: CreateOrUpdateDomainProfileDto,
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
      const result = await this.domainProfileService.createOrUpdateDomainProfile(
        userId,
        createOrUpdateDto
      );

      return {
        success: true,
        message: result.isNew ? 'Domain profile created successfully' : 'Domain profile updated successfully',
        data: result
      };
    } catch (error) {
      console.error('Error creating/updating domain profile:', error);
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
