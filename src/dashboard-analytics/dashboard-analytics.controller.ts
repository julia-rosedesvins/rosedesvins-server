import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardAnalyticsService } from './dashboard-analytics.service';
import { UserGuard } from '../guards/user.guard';
import { AdminGuard } from '../guards/admin.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { CurrentAdmin } from '../decorators/current-admin.decorator';

@ApiTags('Dashboard Analytics')
@Controller('dashboard-analytics')
export class DashboardAnalyticsController {
  constructor(private readonly dashboardAnalyticsService: DashboardAnalyticsService) {}

  @Get('user')
  @UseGuards(UserGuard)
  @ApiOperation({ summary: 'Get user dashboard analytics' })
  @ApiBearerAuth('user-token')
  async getUserDashboardAnalytics(@CurrentUser() user: any): Promise<{
    success: boolean;
    message: string;
    data: {
      reservationsThisMonth: number;
      visitors: number;
      conversionRate: number;
      turnover: number;
      nextReservations: {
        bookingTime: string;
        bookingDate: string;
        participantsAdults: number;
        participantsEnfants: number;
        eventName: string;
        customerEmail: string;
        phoneNo: string;
      }[];
    };
  }> {
    try {
      const analytics = await this.dashboardAnalyticsService.getUserDashboardAnalytics(user.sub);
      
      return {
        success: true,
        message: 'Dashboard analytics retrieved successfully',
        data: analytics,
      };
    } catch (error) {
      throw error;
    }
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get admin dashboard analytics' })
  @ApiBearerAuth('admin-token')
  async getAdminAnalytics(@CurrentAdmin() admin: any): Promise<{
    success: boolean;
    message: string;
    data: {
      totalActiveUsers: number;
      totalPendingUsers: number;
      totalRejectedUsers: number;
      totalActiveSubscriptions: number;
      totalExpiredSubscriptions: number;
      totalOpenSupportTickets: number;
    };
  }> {
    try {
      const analytics = await this.dashboardAnalyticsService.getAdminAnalytics();
      
      return {
        success: true,
        message: 'Admin dashboard analytics retrieved successfully',
        data: analytics,
      };
    } catch (error) {
      throw error;
    }
  }
}
