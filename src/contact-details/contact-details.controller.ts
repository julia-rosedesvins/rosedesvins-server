import { Controller, Get, Put, UseGuards, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ContactDetailsService, UpdateContactDetailsDto } from './contact-details.service';
import { UserGuard } from '../guards/user.guard';
import { CurrentUser } from '../decorators/current-user.decorator';

@ApiTags('Contact Details')
@Controller('contact-details')
export class ContactDetailsController {
  constructor(private readonly contactDetailsService: ContactDetailsService) {}

  @Get('me')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Get current user contact details' })
  @ApiBearerAuth('user-token')
  async getCurrentUserDetails(@CurrentUser() currentUser: any) {
    try {
      const userDetails = await this.contactDetailsService.getCurrentUserDetails(currentUser.sub);
      
      return {
        success: true,
        message: 'User contact details retrieved successfully',
        data: userDetails,
      };
    } catch (error) {
      throw error;
    }
  }

  @Put('me')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Update current user contact details' })
  @ApiBearerAuth('user-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', example: 'John' },
        lastName: { type: 'string', example: 'Doe' },
        phoneNumber: { type: 'string', example: '+33 6 12 34 56 78' },
        domainName: { type: 'string', example: 'Domaine John Doe' },
        address: { type: 'string', example: '123 Rue Example' },
        codePostal: { type: 'string', example: '37210' },
        city: { type: 'string', example: 'Vouvray' },
        siteWeb: { type: 'string', example: 'www.example.com' }
      }
    }
  })
  async updateCurrentUserDetails(
    @CurrentUser() currentUser: any,
    @Body() updateData: UpdateContactDetailsDto
  ) {
    try {
      const updatedUserDetails = await this.contactDetailsService.updateCurrentUserDetails(
        currentUser.sub,
        updateData
      );
      
      return {
        success: true,
        message: 'User contact details updated successfully',
        data: updatedUserDetails,
      };
    } catch (error) {
      throw error;
    }
  }
}
