import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  DashboardAnalyticsService,
  DashboardPeriod,
  DashboardAnalytics,
} from './dashboard-analytics.service';
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
  @ApiQuery({
    name: 'period',
    required: false,
    enum: ['week', 'month', 'year'],
    description: 'Time period for KPI metrics (bookingsByMonth is always YTD)',
  })
  async getUserDashboardAnalytics(
    @CurrentUser() user: { sub: string },
    @Query('period') period?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: DashboardAnalytics;
  }> {
    const normalizedPeriod: DashboardPeriod =
      period === 'week' || period === 'month' || period === 'year' ? period : 'month';

    const analytics = await this.dashboardAnalyticsService.getUserDashboardAnalytics(
      user.sub,
      normalizedPeriod,
    );

    return {
      success: true,
      message: 'Dashboard analytics retrieved successfully',
      data: analytics,
    };
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get admin dashboard analytics' })
  @ApiBearerAuth('admin-token')
  async getAdminAnalytics(@CurrentAdmin() admin: unknown): Promise<{
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
    const analytics = await this.dashboardAnalyticsService.getAdminAnalytics();

    return {
      success: true,
      message: 'Admin dashboard analytics retrieved successfully',
      data: analytics,
    };
  }
}
