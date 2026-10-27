import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  DashboardAnalyticsService,
  DashboardPeriod,
  DashboardAnalytics,
  BOOKING_SOURCE_OPTIONS,
  BookingSourceOption,
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
    description: 'Time period for KPI metrics (filtered by scheduled booking date)',
  })
  @ApiQuery({
    name: 'bookingSources',
    required: false,
    type: String,
    description:
      'Comma-separated booking sources to include (manual, widget, platform). Omit or include all 3 to disable filtering (includes legacy bookings with no bookingSource).',
  })
  async getUserDashboardAnalytics(
    @CurrentUser() user: { sub: string },
    @Query('period') period?: string,
    @Query('bookingSources') bookingSourcesParam?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: DashboardAnalytics;
  }> {
    const normalizedPeriod: DashboardPeriod =
      period === 'week' || period === 'month' || period === 'year' ? period : 'year';

    const bookingSources: BookingSourceOption[] | undefined = bookingSourcesParam
      ? bookingSourcesParam
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is BookingSourceOption =>
            (BOOKING_SOURCE_OPTIONS as readonly string[]).includes(s),
          )
      : undefined;

    const analytics = await this.dashboardAnalyticsService.getUserDashboardAnalytics(
      user.sub,
      normalizedPeriod,
      bookingSources,
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
