import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserBooking } from '../schemas/user-bookings.schema';
import { Event } from '../schemas/events.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { User, AccountStatus } from '../schemas/user.schema';
import { Subscription } from '../schemas/subscriptions.schema';
import { SupportContact } from '../schemas/support-contact.schema';

export type DashboardPeriod = 'week' | 'month' | 'year';

export const BOOKING_SOURCE_OPTIONS = ['manual', 'widget', 'platform'] as const;
export type BookingSourceOption = (typeof BOOKING_SOURCE_OPTIONS)[number];

export interface BookingChartPoint {
  label: string;
  count: number;
}

/** @deprecated Use BookingChartPoint */
export type MonthlyBookingCount = BookingChartPoint;

export interface DashboardAnalytics {
  period: DashboardPeriod;
  reservations: number;
  reservationsThisMonth: number;
  visitors: number;
  conversionRate: number;
  turnover: number;
  bookingChart: BookingChartPoint[];
  /** @deprecated Use bookingChart */
  bookingsByMonth: BookingChartPoint[];
  nextReservations: {
    bookingTime: string;
    bookingDate: string;
    participantsAdults: number;
    participantsEnfants: number;
    eventName: string;
    customerEmail: string;
    phoneNo: string;
  }[];
}

interface NextReservation {
  bookingTime: string;
  bookingDate: string;
  participantsAdults: number;
  participantsEnfants: number;
  eventName: string;
  customerEmail: string;
  phoneNo: string;
}

interface AdminAnalytics {
  totalActiveUsers: number;
  totalPendingUsers: number;
  totalRejectedUsers: number;
  totalActiveSubscriptions: number;
  totalExpiredSubscriptions: number;
  totalOpenSupportTickets: number;
}

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'completed'];

/**
 * Only restricts by bookingSource when a subset of the canonical sources is
 * selected. When all 3 are selected (the default "all checked" state), no
 * condition is added so legacy bookings created before this field existed
 * (bookingSource undefined) keep showing up exactly as they do today.
 */
function buildBookingSourceMatch(
  bookingSources?: BookingSourceOption[],
): Record<string, unknown> {
  if (!bookingSources || bookingSources.length === BOOKING_SOURCE_OPTIONS.length) {
    return {};
  }
  return { bookingSource: { $in: bookingSources } };
}

@Injectable()
export class DashboardAnalyticsService {
  constructor(
    @InjectModel(UserBooking.name) private userBookingModel: Model<UserBooking>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
    @InjectModel(SupportContact.name) private supportContactModel: Model<SupportContact>,
  ) {}

  async getUserDashboardAnalytics(
    userId: string,
    period: DashboardPeriod = 'month',
    bookingSources?: BookingSourceOption[],
  ): Promise<DashboardAnalytics> {
    const userObjectId = new Types.ObjectId(userId);
    const { startDate, endDate } = this.getPeriodRange(period);
    const bookingSourceMatch = buildBookingSourceMatch(bookingSources);

    const [reservations, visitors, turnover, bookingChart, nextReservations] = await Promise.all([
      this.getReservationsInRange(userObjectId, startDate, endDate, bookingSourceMatch),
      this.getVisitors(userObjectId, startDate, endDate, bookingSourceMatch),
      this.calculateTurnover(userObjectId, startDate, endDate, bookingSourceMatch),
      this.getBookingChartSeries(userObjectId, period, startDate, endDate, bookingSourceMatch),
      this.getNextReservations(userObjectId, bookingSourceMatch),
    ]);

    // Cap at 100%: reservations should not exceed visitors in a valid funnel.
    const conversionRate =
      visitors > 0 ? Math.min(100, (reservations / visitors) * 100) : 0;

    return {
      period,
      reservations,
      reservationsThisMonth: reservations,
      visitors,
      conversionRate: Math.round(conversionRate * 100) / 100,
      turnover: Math.round(turnover * 100) / 100,
      bookingChart,
      bookingsByMonth: bookingChart,
      nextReservations,
    };
  }

  private getPeriodRange(period: DashboardPeriod): { startDate: Date; endDate: Date } {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    if (period === 'week') {
      const day = now.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      startDate.setDate(now.getDate() + diffToMonday);

      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);

      return { startDate, endDate };
    }

    if (period === 'year') {
      return {
        startDate: new Date(year, 0, 1, 0, 0, 0, 0),
        endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
      };
    }

    return {
      startDate: new Date(year, month, 1, 0, 0, 0, 0),
      endDate: new Date(year, month + 1, 0, 23, 59, 59, 999),
    };
  }

  private async getBookingCountsByDay(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date,
    bookingSourceMatch: Record<string, unknown>,
  ): Promise<Map<string, number>> {
    const aggregated = await this.userBookingModel.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
          bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
          isDeleted: { $ne: true },
          ...bookingSourceMatch,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Europe/Paris' },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    return new Map(aggregated.map((entry) => [entry._id, entry.count]));
  }

  private formatDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async getBookingChartSeries(
    userId: Types.ObjectId,
    period: DashboardPeriod,
    startDate: Date,
    endDate: Date,
    bookingSourceMatch: Record<string, unknown>,
  ): Promise<BookingChartPoint[]> {
    if (period === 'year') {
      return this.getYearlyChartSeries(userId, startDate, endDate, bookingSourceMatch);
    }

    const countsByDay = await this.getBookingCountsByDay(userId, startDate, endDate, bookingSourceMatch);
    const points: BookingChartPoint[] = [];
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= endDate) {
      const key = this.formatDateKey(cursor);

      if (period === 'week') {
        const weekdayIndex = (cursor.getDay() + 6) % 7;
        points.push({
          label: WEEKDAY_LABELS[weekdayIndex],
          count: countsByDay.get(key) ?? 0,
        });
      } else {
        points.push({
          label: String(cursor.getDate()),
          count: countsByDay.get(key) ?? 0,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return points;
  }

  private async getYearlyChartSeries(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date,
    bookingSourceMatch: Record<string, unknown>,
  ): Promise<BookingChartPoint[]> {
    const aggregated = await this.userBookingModel.aggregate<{ _id: number; count: number }>([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
          bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
          isDeleted: { $ne: true },
          ...bookingSourceMatch,
        },
      },
      {
        $group: {
          _id: { $month: { date: '$createdAt', timezone: 'Europe/Paris' } },
          count: { $sum: 1 },
        },
      },
    ]);

    const countsByMonth = new Map(aggregated.map((entry) => [entry._id, entry.count]));
    const currentMonth = endDate.getMonth() + 1;

    return Array.from({ length: currentMonth }, (_, index) => {
      const month = index + 1;
      return {
        label: MONTH_LABELS[index],
        count: countsByMonth.get(month) ?? 0,
      };
    });
  }

  private async getReservationsInRange(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date,
    bookingSourceMatch: Record<string, unknown>,
  ): Promise<number> {
    return this.userBookingModel.countDocuments({
      userId,
      createdAt: {
        $gte: startDate,
        $lte: endDate,
      },
      bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
      isDeleted: { $ne: true },
      ...bookingSourceMatch,
    });
  }

  /**
   * Nombre de visiteurs = total participants (adults + children) from bookings
   * created in the selected period. Using calendar events previously undercounted
   * visitors vs reservations and produced impossible conversion rates (e.g. 2000%).
   */
  private async getVisitors(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date,
    bookingSourceMatch: Record<string, unknown>,
  ): Promise<number> {
    const aggregated = await this.userBookingModel.aggregate<{ total: number }>([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
          bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
          isDeleted: { $ne: true },
          ...bookingSourceMatch,
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: { $add: ['$participantsAdults', '$participantsEnfants'] },
          },
        },
      },
    ]);

    return aggregated[0]?.total ?? 0;
  }

  private async calculateTurnover(
    userId: Types.ObjectId,
    startDate: Date,
    endDate: Date,
    bookingSourceMatch: Record<string, unknown>,
  ): Promise<number> {
    const domainProfile = await this.domainProfileModel.findOne({ userId }).exec();

    if (!domainProfile?.services?.length) {
      return 0;
    }

    const bookings = await this.userBookingModel
      .find({
        userId,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
        bookingStatus: { $in: ACTIVE_BOOKING_STATUSES },
        isDeleted: { $ne: true },
        ...bookingSourceMatch,
      })
      .exec();

    let totalTurnover = 0;

    for (const booking of bookings) {
      const service = domainProfile.services.find(
        (s: { _id?: Types.ObjectId; pricePerPerson?: number }) =>
          s._id?.toString() === booking.serviceId.toString(),
      );

      if (service?.pricePerPerson != null) {
        const totalParticipants = booking.participantsAdults + booking.participantsEnfants;
        totalTurnover += totalParticipants * service.pricePerPerson;
      }
    }

    return totalTurnover;
  }

  private async getNextReservations(
    userId: Types.ObjectId,
    bookingSourceMatch: Record<string, unknown>,
  ): Promise<NextReservation[]> {
    const currentDate = new Date();

    const upcomingBookings = await this.userBookingModel
      .find({
        userId,
        bookingDate: { $gte: currentDate },
        bookingStatus: { $in: ['pending', 'confirmed'] },
        isDeleted: { $ne: true },
        ...bookingSourceMatch,
      })
      .sort({ bookingDate: 1, bookingTime: 1 })
      .limit(10)
      .exec();

    const nextReservations: NextReservation[] = [];

    for (const booking of upcomingBookings) {
      let eventName = 'Unknown Event';

      const event = await this.eventModel
        .findOne({
          bookingId: booking._id,
          eventType: 'booking',
          eventStatus: 'active',
          isDeleted: { $ne: true },
        })
        .exec();

      if (event) {
        eventName = event.eventName;
      }

      nextReservations.push({
        bookingTime: booking.bookingTime,
        bookingDate: booking.bookingDate.toISOString().split('T')[0],
        participantsAdults: booking.participantsAdults,
        participantsEnfants: booking.participantsEnfants,
        eventName,
        customerEmail: booking.customerEmail,
        phoneNo: booking.phoneNo,
      });
    }

    return nextReservations;
  }

  async getAdminAnalytics(): Promise<AdminAnalytics> {
    const totalActiveUsers = await this.userModel.countDocuments({
      accountStatus: AccountStatus.ACTIVE,
    });

    const totalPendingUsers = await this.userModel.countDocuments({
      accountStatus: AccountStatus.PENDING_APPROVAL,
    });

    const totalRejectedUsers = await this.userModel.countDocuments({
      accountStatus: AccountStatus.REJECTED,
    });

    const currentDate = new Date();
    const totalActiveSubscriptions = await this.subscriptionModel.countDocuments({
      isActive: true,
      startDate: { $lte: currentDate },
      endDate: { $gte: currentDate },
      cancelledById: null,
    });

    const totalExpiredSubscriptions = await this.subscriptionModel.countDocuments({
      endDate: { $lt: currentDate },
    });

    const totalOpenSupportTickets = await this.supportContactModel.countDocuments({
      status: { $in: ['pending', 'in-progress'] },
    });

    return {
      totalActiveUsers,
      totalPendingUsers,
      totalRejectedUsers,
      totalActiveSubscriptions,
      totalExpiredSubscriptions,
      totalOpenSupportTickets,
    };
  }
}
