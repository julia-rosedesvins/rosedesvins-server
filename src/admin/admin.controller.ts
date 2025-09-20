import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminGuard } from '../guards/admin.guard';
import { CurrentAdmin } from '../decorators/current-admin.decorator';

@ApiTags('Admin Dashboard')
@Controller('admin')
@UseGuards(AdminGuard) // Apply to all routes in this controller
@ApiBearerAuth('admin-token')
export class AdminController {
  
  @Get('dashboard')
  @ApiOperation({ summary: 'Get admin dashboard data' })
  async getDashboardData(@CurrentAdmin() currentAdmin: any) {
    return {
      success: true,
      message: 'Dashboard data retrieved successfully',
      data: {
        adminInfo: {
          id: currentAdmin.sub,
          email: currentAdmin.email,
          firstName: currentAdmin.firstName,
          lastName: currentAdmin.lastName,
          role: currentAdmin.role,
        },
        stats: {
          totalUsers: 0,
          pendingApprovals: 0,
          activeReservations: 0,
        }
      }
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current admin profile' })
  async getProfile(@CurrentAdmin() currentAdmin: any) {
    return {
      success: true,
      message: 'Admin profile retrieved successfully',
      data: {
        id: currentAdmin.sub,
        email: currentAdmin.email,
        firstName: currentAdmin.firstName,
        lastName: currentAdmin.lastName,
        role: currentAdmin.role,
      }
    };
  }
}
