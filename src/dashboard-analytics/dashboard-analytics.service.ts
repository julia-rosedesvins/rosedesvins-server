import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserBooking } from '../schemas/user-bookings.schema';
import { Event } from '../schemas/events.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';

interface DashboardAnalytics {
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

@Injectable()
export class DashboardAnalyticsService {
  constructor(
    @InjectModel(UserBooking.name) private userBookingModel: Model<UserBooking>,
    @InjectModel(Event.name) private eventModel: Model<Event>,
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
  ) {}

  async getUserDashboardAnalytics(userId: string): Promise<DashboardAnalytics> {
    const userObjectId = new Types.ObjectId(userId);
    
    // Get current month start and end dates
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1. Get number of reservations this month
    const reservationsThisMonth = await this.getReservationsThisMonth(userObjectId, startOfMonth, endOfMonth);

    // 2. Get number of visitors (using events)
    const visitors = await this.getVisitors(userObjectId, startOfMonth, endOfMonth);

    // 3. Calculate conversion rate (reservations / visitors)
    const conversionRate = visitors > 0 ? (reservationsThisMonth / visitors) * 100 : 0;

    // 4. Calculate turnover
    const turnover = await this.calculateTurnover(userObjectId, startOfMonth, endOfMonth);

    // 5. Get next reservations list
    const nextReservations = await this.getNextReservations(userObjectId);

    return {
      reservationsThisMonth,
      visitors,
      conversionRate: Math.round(conversionRate * 100) / 100, // Round to 2 decimal places
      turnover: Math.round(turnover * 100) / 100, // Round to 2 decimal places
      nextReservations,
    };
  }

  private async getReservationsThisMonth(
    userId: Types.ObjectId, 
    startOfMonth: Date, 
    endOfMonth: Date
  ): Promise<number> {
    return await this.userBookingModel.countDocuments({
      userId,
      bookingDate: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
      bookingStatus: { $in: ['pending', 'confirmed', 'completed'] }, // Exclude cancelled, etc.
    });
  }

  private async getVisitors(
    userId: Types.ObjectId, 
    startOfMonth: Date, 
    endOfMonth: Date
  ): Promise<number> {
    // Count all events for this user in the month (visitors/events created)
    return await this.eventModel.countDocuments({
      userId,
      eventDate: {
        $gte: startOfMonth,
        $lte: endOfMonth,
      },
      eventStatus: 'active',
    });
  }

  private async calculateTurnover(
    userId: Types.ObjectId, 
    startOfMonth: Date, 
    endOfMonth: Date
  ): Promise<number> {
    // Get user's domain profile to access services and their prices
    const domainProfile = await this.domainProfileModel
      .findOne({ userId })
      .exec();

    if (!domainProfile || !domainProfile.services || domainProfile.services.length === 0) {
      return 0;
    }

    // Get all bookings for this month
    const bookings = await this.userBookingModel
      .find({
        userId,
        bookingDate: {
          $gte: startOfMonth,
          $lte: endOfMonth,
        },
        bookingStatus: { $in: ['pending','confirmed', 'completed'] }, // Only confirmed/completed bookings
      })
      .exec();

    let totalTurnover = 0;

    for (const booking of bookings) {
      // Find the service in domain profile
      const service = domainProfile.services.find(
        (s: any) => s._id.toString() === booking.serviceId.toString()
      );

      if (service) {
        const totalParticipants = booking.participantsAdults + booking.participantsEnfants;
        const serviceRevenue = totalParticipants * service.pricePerPerson;
        totalTurnover += serviceRevenue;
      }
    }

    return totalTurnover;
  }

  private async getNextReservations(userId: Types.ObjectId): Promise<NextReservation[]> {
    const currentDate = new Date();
    
    // Get upcoming bookings (next 10 reservations)
    const upcomingBookings = await this.userBookingModel
      .find({
        userId,
        bookingDate: { $gte: currentDate },
        bookingStatus: { $in: ['pending', 'confirmed'] },
      })
      .sort({ bookingDate: 1, bookingTime: 1 }) // Sort by date and time ascending
      .limit(10)
      .exec();

    const nextReservations: NextReservation[] = [];

    for (const booking of upcomingBookings) {
      let eventName = 'Unknown Event';
      
      // Find the corresponding event from events table using bookingId
      const event = await this.eventModel
        .findOne({ 
          bookingId: booking._id,
          eventType: 'booking',
          eventStatus: 'active'
        })
        .exec();
      
      if (event) {
        eventName = event.eventName;
      }

      nextReservations.push({
        bookingTime: booking.bookingTime,
        bookingDate: booking.bookingDate.toISOString().split('T')[0], // Format as YYYY-MM-DD
        participantsAdults: booking.participantsAdults,
        participantsEnfants: booking.participantsEnfants,
        eventName,
        customerEmail: booking.customerEmail,
        phoneNo: booking.phoneNo,
      });
    }

    return nextReservations;
  }
}
