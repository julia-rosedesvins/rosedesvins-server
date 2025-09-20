import { Controller, Post, Body, Res, HttpStatus, Get, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { UsersService } from './users.service';
import { AdminGuard } from '../guards/admin.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  CreateAdminSchema, 
  AdminLoginSchema, 
  CreateAdminDto, 
  AdminLoginDto 
} from '../validators/admin.validators';

@ApiTags('Admin')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('admin/seed')
  @ApiOperation({ summary: 'Create admin user (seeder)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', example: 'Admin' },
        lastName: { type: 'string', example: 'User' },
        email: { type: 'string', example: 'admin@rosedesvins.com' },
        password: { type: 'string', example: 'SecurePassword123!' },
        domainName: { type: 'string', example: 'Rose des Vins Admin' }
      },
      required: ['firstName', 'lastName', 'email', 'password']
    }
  })
  @UsePipes(new ZodValidationPipe(CreateAdminSchema))
  async createAdminUser(@Body() createAdminDto: CreateAdminDto) {
    try {
      const admin = await this.usersService.createAdminUser(createAdminDto);
      
      // Remove password from response
      const { password, ...adminResponse } = admin.toObject();
      
      return {
        success: true,
        message: 'Admin user created successfully',
        data: adminResponse,
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('admin/login')
  @ApiOperation({ summary: 'Admin login' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'admin@rosedesvins.com' },
        password: { type: 'string', example: 'SecurePassword123!' }
      },
      required: ['email', 'password']
    }
  })
  @UsePipes(new ZodValidationPipe(AdminLoginSchema))
  async adminLogin(
    @Body() adminLoginDto: AdminLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const loginResult = await this.usersService.adminLogin(adminLoginDto);

      // Set JWT token in httpOnly cookie
      response.cookie('admin_token', loginResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });

      return {
        success: true,
        message: 'Admin login successful',
        data: {
          user: loginResult.user,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('admin/list')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get all admin users' })
  @ApiBearerAuth('admin-token')
  async getAllAdmins(@CurrentAdmin() currentAdmin: any) {
    try {
      const admins = await this.usersService.getAllAdmins();
      
      return {
        success: true,
        message: 'Admins retrieved successfully',
        data: admins,
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('admin/logout')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin logout' })
  @ApiBearerAuth('admin-token')
  async adminLogout(
    @Res({ passthrough: true }) response: Response,
    @CurrentAdmin() currentAdmin: any
  ) {
    // Clear the admin token cookie
    response.clearCookie('admin_token');
    
    return {
      success: true,
      message: 'Admin logout successful',
    };
  }

  @Get('admin/me')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get current admin profile' })
  @ApiBearerAuth('admin-token')
  async getAdminProfile(@CurrentAdmin() currentAdmin: any) {
    try {
      const admin = await this.usersService.getAdminProfile(currentAdmin.sub);
      
      return {
        success: true,
        message: 'Admin profile retrieved successfully',
        data: admin,
      };
    } catch (error) {
      throw error;
    }
  }
}
