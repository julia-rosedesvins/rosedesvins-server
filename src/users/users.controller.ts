import { Controller, Post, Body, Res, HttpStatus, Get, UseGuards, UsePipes, Query, Put, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { UsersService } from './users.service';
import { AdminGuard } from '../guards/admin.guard';
import { UserGuard } from '../guards/user.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { 
  CreateAdminSchema, 
  AdminLoginSchema, 
  CreateAdminDto, 
  AdminLoginDto 
} from '../validators/admin.validators';
import { 
  ContactFormSchema, 
  ContactFormDto,
  PaginationQuerySchema,
  PaginationQueryDto,
  UserActionSchema,
  UserActionDto,
  UserLoginSchema,
  UserLoginDto,
  ChangePasswordSchema,
  ChangePasswordDto,
  ForgotPasswordSchema,
  ForgotPasswordDto,
  ResetPasswordSchema,
  ResetPasswordDto,
  UpdateUserSchema,
  UpdateUserDto
} from '../validators/user.validators';

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
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
        path: '/',
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

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'UserPassword123!' }
      },
      required: ['email', 'password']
    }
  })
  @UsePipes(new ZodValidationPipe(UserLoginSchema))
  async userLogin(
    @Body() userLoginDto: UserLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const loginResult = await this.usersService.userLogin(userLoginDto);

      // Set JWT token in httpOnly cookie
      response.cookie('user_token', loginResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
        path: '/',
      });

      return {
        success: true,
        message: 'User login successful',
        data: {
          user: loginResult.user,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' }
      },
      required: ['email']
    }
  })
  @UsePipes(new ZodValidationPipe(ForgotPasswordSchema))
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    try {
      const result = await this.usersService.forgotPassword(forgotPasswordDto);
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string', example: 'reset-token' },
        newPassword: { type: 'string', example: 'NewPassword123!' }
      },
      required: ['token', 'newPassword']
    }
  })
  @UsePipes(new ZodValidationPipe(ResetPasswordSchema))
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    try {
      const result = await this.usersService.resetPassword(resetPasswordDto);
      return {
        success: true,
        message: result.message,
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
    response.clearCookie('admin_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
      path: '/',
    });
    
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

  @Post('contact')
  @ApiOperation({ summary: 'Submit contact form application' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', example: 'John' },
        lastName: { type: 'string', example: 'Doe' },
        email: { type: 'string', example: 'john.doe@example.com' },
        domainName: { type: 'string', example: 'My Wine Business' }
      },
      required: ['firstName', 'lastName', 'email', 'domainName']
    }
  })
  @UsePipes(new ZodValidationPipe(ContactFormSchema))
  async submitContactForm(@Body() contactFormDto: ContactFormDto) {
    try {
      const user = await this.usersService.submitContactForm(contactFormDto);
      
      // Remove sensitive fields from response
      const { password, loginToken, ...userResponse } = user.toObject();
      
      return {
        success: true,
        message: 'Contact form submitted successfully. Your application is pending approval.',
        data: userResponse,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('admin/pending-approval')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get users with pending approval status (paginated)' })
  @ApiBearerAuth('admin-token')
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page (default: 10, max: 50)' })
  async getPendingApprovalUsers(
    @CurrentAdmin() currentAdmin: any,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryDto
  ) {
    try {
      const result = await this.usersService.getPendingApprovalUsers(query);
      
      return {
        success: true,
        message: 'Pending approval users retrieved successfully',
        data: result.users,
        pagination: result.pagination,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('admin/approved')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get approved/active users (paginated)' })
  @ApiBearerAuth('admin-token')
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page (default: 10, max: 50)' })
  async getApprovedUsers(
    @CurrentAdmin() currentAdmin: any,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryDto
  ) {
    try {
      const result = await this.usersService.getApprovedUsers(query);
      
      return {
        success: true,
        message: 'Approved users retrieved successfully',
        data: result.users,
        pagination: result.pagination,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('admin/rejected')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get rejected users (paginated)' })
  @ApiBearerAuth('admin-token')
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10, description: 'Items per page (default: 10, max: 50)' })
  async getRejectedUsers(
    @CurrentAdmin() currentAdmin: any,
    @Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQueryDto
  ) {
    try {
      const result = await this.usersService.getRejectedUsers(query);
      
      return {
        success: true,
        message: 'Rejected users retrieved successfully',
        data: result.users,
        pagination: result.pagination,
      };
    } catch (error) {
      throw error;
    }
  }

  @Put('admin/user-action')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Approve or reject a user account' })
  @ApiBearerAuth('admin-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string', example: '60d0fe4f5311236168a109ca' },
        action: { type: 'string', enum: ['approve', 'reject'], example: 'approve' }
      },
      required: ['userId', 'action']
    }
  })
  async processUserAction(
    @Body(new ZodValidationPipe(UserActionSchema)) userActionDto: UserActionDto,
    @CurrentAdmin() currentAdmin: any
  ) {
    try {
      const user = await this.usersService.processUserAction(userActionDto, currentAdmin.sub);
      
      // Remove sensitive fields from response
      const { password, loginToken, ...userResponse } = user.toObject();
      
      return {
        success: true,
        message: userActionDto.action === 'approve' 
          ? 'User account approved successfully. Login credentials sent via email.' 
          : 'User account rejected successfully. Notification sent via email.',
        data: userResponse,
      };
    } catch (error) {
      throw error;
    }
  }

  @Put('admin/users/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update user details' })
  @ApiBearerAuth('admin-token')
  async updateUser(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) updateUserDto: UpdateUserDto,
  ) {
    try {
      const user = await this.usersService.updateUser(id, updateUserDto);
      
      // Remove sensitive fields from response
      const { password, loginToken, ...userResponse } = user.toObject();
      
      return {
        success: true,
        message: 'User updated successfully',
        data: userResponse,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('me')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiBearerAuth('user-token')
  async getCurrentUser(@CurrentUser() currentUser: any) {
    try {
      const user = await this.usersService.getUserProfile(currentUser.sub);
      
      return {
        success: true,
        message: 'User profile retrieved successfully',
        data: user,
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'User logout' })
  @ApiBearerAuth('user-token')
  async userLogout(@Res({ passthrough: true }) response: Response) {
    try {
      // Clear the user token cookie
      response.clearCookie('user_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
        path: '/',
      });

      return {
        success: true,
        message: 'User logout successful',
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('change-password')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Change user password' })
  @ApiBearerAuth('user-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        currentPassword: { type: 'string', example: 'CurrentPassword123!' },
        newPassword: { type: 'string', example: 'NewPassword123!' }
      },
      required: ['currentPassword', 'newPassword']
    }
  })
  async changeUserPassword(
    @Body(new ZodValidationPipe(ChangePasswordSchema)) changePasswordDto: ChangePasswordDto,
    @CurrentUser() user: any
  ) {
    try {
      const result = await this.usersService.changeUserPassword(changePasswordDto, user.sub);
      
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('admin/change-password')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Change admin password' })
  @ApiBearerAuth('admin-token')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        currentPassword: { type: 'string', example: 'CurrentPassword123!' },
        newPassword: { type: 'string', example: 'NewPassword123!' }
      },
      required: ['currentPassword', 'newPassword']
    }
  })
  async changeAdminPassword(
    @Body(new ZodValidationPipe(ChangePasswordSchema)) changePasswordDto: ChangePasswordDto,
    @CurrentAdmin() admin: any
  ) {
    try {
      const result = await this.usersService.changeAdminPassword(changePasswordDto, admin.sub);
      
      return {
        success: true,
        message: result.message,
      };
    } catch (error) {
      throw error;
    }
  }

  @Post('quick-login')
  @ApiOperation({ summary: 'Quick login with email only (public endpoint)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' }
      },
      required: ['email']
    }
  })
  async quickLogin(
    @Body() body: { email: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      const loginResult = await this.usersService.quickLoginByEmail(body.email);

      // Set JWT token in httpOnly cookie
      response.cookie('user_token', loginResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined,
        path: '/',
      });

      return {
        success: true,
        message: 'Quick login successful',
        data: {
          user: loginResult.user,
        },
      };
    } catch (error) {
      throw error;
    }
  }
}
