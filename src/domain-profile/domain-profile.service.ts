import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { User } from '../schemas/user.schema';
import { promises as fs } from 'fs';
import { join } from 'path';

export interface CreateOrUpdateDomainProfileServiceDto {
  domainName?: string;
  domainDescription?: string;
  domainType?: string;
  domainTag?: string;
  domainColor?: string;
  domainProfilePictureUrl?: string;
  domainLogoUrl?: string;
  services?: Array<{
    serviceName: string;
    serviceDescription: string;
    numberOfPeople: string;
    pricePerPerson: number;
    timeOfServiceInMinutes: number;
    numberOfWinesTasted: number;
    languagesOffered: string[];
    serviceBannerUrl?: string;
    isActive: boolean;
  }>;
}

@Injectable()
export class DomainProfileService {
  constructor(
    @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async createOrUpdateDomainProfile(
    userId: string,
    domainProfileDto: CreateOrUpdateDomainProfileServiceDto,
    files?: { 
      domainProfilePicture?: Express.Multer.File[];
      domainLogo?: Express.Multer.File[];
    }
  ): Promise<{
    domainProfile: DomainProfile;
    isNew: boolean;
  }> {
    const userObjectId = new Types.ObjectId(userId);

    // Update user's domain name if provided
    if (domainProfileDto.domainName) {
      await this.userModel.findByIdAndUpdate(
        userObjectId,
        { domainName: domainProfileDto.domainName },
        { new: true }
      );
    }

    // Check if domain profile already exists for file cleanup
    const existingDomainProfile = await this.domainProfileModel.findOne({
      userId: userObjectId
    });

    // Handle file uploads
    let domainProfilePictureUrl = domainProfileDto.domainProfilePictureUrl;
    let domainLogoUrl = domainProfileDto.domainLogoUrl;

    if (files?.domainProfilePicture?.[0]) {
      // Clean up old file if exists
      if (existingDomainProfile?.domainProfilePictureUrl) {
        await this.deleteFile(existingDomainProfile.domainProfilePictureUrl);
      }
      domainProfilePictureUrl = `/uploads/domain-profiles/${files.domainProfilePicture[0].filename}`;
    }

    if (files?.domainLogo?.[0]) {
      // Clean up old file if exists
      if (existingDomainProfile?.domainLogoUrl) {
        await this.deleteFile(existingDomainProfile.domainLogoUrl);
      }
      domainLogoUrl = `/uploads/domain-profiles/${files.domainLogo[0].filename}`;
    }

    const profileData = {
      userId: userObjectId,
      domainDescription: domainProfileDto.domainDescription,
      domainType: domainProfileDto.domainType,
      domainTag: domainProfileDto.domainTag,
      colorCode: domainProfileDto.domainColor,
      domainProfilePictureUrl,
      domainLogoUrl,
      // Only include services if they are explicitly provided
      ...(domainProfileDto.services !== undefined && { services: domainProfileDto.services })
    };

    if (existingDomainProfile) {
      // Update existing domain profile - only update provided fields
      const updateData: any = {};
      
      if (domainProfileDto.domainDescription !== undefined) {
        updateData.domainDescription = domainProfileDto.domainDescription;
      }
      if (domainProfileDto.domainType !== undefined) {
        updateData.domainType = domainProfileDto.domainType;
      }
      if (domainProfileDto.domainTag !== undefined) {
        updateData.domainTag = domainProfileDto.domainTag;
      }
      if (domainProfileDto.domainColor !== undefined) {
        updateData.colorCode = domainProfileDto.domainColor;
      }
      if (domainProfilePictureUrl !== undefined) {
        updateData.domainProfilePictureUrl = domainProfilePictureUrl;
      }
      if (domainLogoUrl !== undefined) {
        updateData.domainLogoUrl = domainLogoUrl;
      }
      // Only update services if explicitly provided
      if (domainProfileDto.services !== undefined) {
        updateData.services = domainProfileDto.services;
      }

      const updatedDomainProfile = await this.domainProfileModel.findByIdAndUpdate(
        existingDomainProfile._id,
        updateData,
        { new: true }
      ).populate('userId', 'firstName lastName email domainName')
       .exec();

      if (!updatedDomainProfile) {
        throw new NotFoundException('Failed to update domain profile');
      }

      return {
        domainProfile: updatedDomainProfile,
        isNew: false
      };
    } else {
      // Create new domain profile - include services with default empty array
      const newDomainProfile = new this.domainProfileModel({
        ...profileData,
        services: domainProfileDto.services || [] // Default to empty array for new profiles
      });
      const savedDomainProfile = await newDomainProfile.save();
      
      const populatedDomainProfile = await this.domainProfileModel
        .findById(savedDomainProfile._id)
        .populate('userId', 'firstName lastName email domainName')
        .exec();

      if (!populatedDomainProfile) {
        throw new NotFoundException('Failed to retrieve created domain profile');
      }

      return {
        domainProfile: populatedDomainProfile,
        isNew: true
      };
    }
  }

  async getCurrentUserDomainProfile(userId: string): Promise<DomainProfile | null> {
    const userObjectId = new Types.ObjectId(userId);
    
    const domainProfile = await this.domainProfileModel
      .findOne({ userId: userObjectId })
      .populate('userId', 'domainName')
      .exec();

    return domainProfile;
  }

  /**
   * Add a new service to user's domain profile
   * @param userId - User ID
   * @param serviceData - Service data to add
   * @param files - Uploaded files (serviceBanner)
   * @returns Updated domain profile
   */
  async addService(
    userId: string, 
    serviceData: any,
    files?: { serviceBanner?: Express.Multer.File[] }
  ): Promise<DomainProfile> {
    const userObjectId = new Types.ObjectId(userId);
    
    // Handle service banner file upload
    let serviceBannerUrl = serviceData.serviceBannerUrl;
    
    if (files?.serviceBanner?.[0]) {
      serviceBannerUrl = `/uploads/domain-profiles/${files.serviceBanner[0].filename}`;
    }
    
    const mappedServiceData = {
      name: serviceData.serviceName,
      description: serviceData.serviceDescription,
      numberOfPeople: serviceData.numberOfPeople,
      pricePerPerson: serviceData.pricePerPerson,
      timeOfServiceInMinutes: serviceData.timeOfServiceInMinutes,
      numberOfWinesTasted: serviceData.numberOfWinesTasted,
      languagesOffered: serviceData.languagesOffered,
      serviceBannerUrl: serviceBannerUrl,
      isActive: serviceData.isActive
    };
    
    const domainProfile = await this.domainProfileModel.findOneAndUpdate(
      { userId: userObjectId },
      { $push: { services: mappedServiceData } },
      { new: true, upsert: true }
    ).populate('userId', 'firstName lastName email domainName').exec();

    if (!domainProfile) {
      throw new NotFoundException('Domain profile not found');
    }

    return domainProfile;
  }

  /**
   * Get all services for user's domain profile
   * @param userId - User ID
   * @returns Array of services
   */
  async getServices(userId: string): Promise<any[]> {
    const userObjectId = new Types.ObjectId(userId);
    
    const domainProfile = await this.domainProfileModel
      .findOne({ userId: userObjectId })
      .exec();

    const services = domainProfile?.services || [];
    console.log('Retrieved services from database:', JSON.stringify(services, null, 2));
    
    // Map database fields back to API format
    return services.map(service => ({
      _id: (service as any)._id,
      serviceName: service.name,
      serviceDescription: service.description,
      numberOfPeople: service.numberOfPeople,
      pricePerPerson: service.pricePerPerson,
      timeOfServiceInMinutes: service.timeOfServiceInMinutes,
      numberOfWinesTasted: service.numberOfWinesTasted,
      languagesOffered: service.languagesOffered,
      serviceBannerUrl: service.serviceBannerUrl,
      isActive: service.isActive,
      // New booking settings fields
      bookingRestrictionActive: (service as any).bookingRestrictionActive ?? false,
      bookingRestrictionTime: (service as any).bookingRestrictionTime ?? '24h',
      multipleBookings: (service as any).multipleBookings ?? false,
      hasCustomAvailability: (service as any).hasCustomAvailability ?? false,
      dateAvailability: (service as any).dateAvailability ?? []
    }));
  }

  /**
   * Update a service by index
   * @param userId - User ID
   * @param serviceIndex - Index of the service to update
   * @param updateData - Update data
   * @param files - Uploaded files (serviceBanner)
   * @returns Updated domain profile
   */
  async updateService(
    userId: string, 
    serviceIndex: number, 
    updateData: any,
    files?: { serviceBanner?: Express.Multer.File[] }
  ): Promise<DomainProfile> {
    const userObjectId = new Types.ObjectId(userId);
    
    const domainProfile = await this.domainProfileModel.findOne({ userId: userObjectId });
    
    if (!domainProfile) {
      throw new NotFoundException('Domain profile not found');
    }

    if (serviceIndex >= domainProfile.services.length || serviceIndex < 0) {
      throw new NotFoundException('Service not found at the specified index');
    }

    console.log('Update data before mapping:', JSON.stringify(updateData, null, 2));

    // Handle service banner file upload
    let serviceBannerUrl = updateData.serviceBannerUrl;
    
    if (files?.serviceBanner?.[0]) {
      // Clean up old service banner file if exists
      const existingService = domainProfile.services[serviceIndex];
      if (existingService.serviceBannerUrl) {
        await this.deleteFile(existingService.serviceBannerUrl);
      }
      serviceBannerUrl = `/uploads/domain-profiles/${files.serviceBanner[0].filename}`;
    }

    // Map API fields to database schema fields
    const mappedUpdateData: any = {};
    
    if (updateData.serviceName !== undefined) {
      mappedUpdateData.name = updateData.serviceName;
    }
    if (updateData.serviceDescription !== undefined) {
      mappedUpdateData.description = updateData.serviceDescription;
    }
    if (updateData.numberOfPeople !== undefined) {
      mappedUpdateData.numberOfPeople = updateData.numberOfPeople;
    }
    if (updateData.pricePerPerson !== undefined) {
      mappedUpdateData.pricePerPerson = updateData.pricePerPerson;
    }
    if (updateData.timeOfServiceInMinutes !== undefined) {
      mappedUpdateData.timeOfServiceInMinutes = updateData.timeOfServiceInMinutes;
    }
    if (updateData.numberOfWinesTasted !== undefined) {
      mappedUpdateData.numberOfWinesTasted = updateData.numberOfWinesTasted;
    }
    if (updateData.languagesOffered !== undefined) {
      mappedUpdateData.languagesOffered = updateData.languagesOffered;
    }
    if (serviceBannerUrl !== undefined) {
      mappedUpdateData.serviceBannerUrl = serviceBannerUrl;
    }
    if (updateData.isActive !== undefined) {
      mappedUpdateData.isActive = updateData.isActive;
    }

    console.log('Mapped update data for database:', JSON.stringify(mappedUpdateData, null, 2));

    // Update the service at the specified index
    Object.assign(domainProfile.services[serviceIndex], mappedUpdateData);
    
    await domainProfile.save();
    
    const updatedProfile = await this.domainProfileModel
      .findById(domainProfile._id)
      .populate('userId', 'firstName lastName email domainName')
      .exec();

    if (!updatedProfile) {
      throw new NotFoundException('Failed to retrieve updated domain profile');
    }

    return updatedProfile;
  }

  /**
   * Delete a service by index
   * @param userId - User ID
   * @param serviceIndex - Index of the service to delete
   */
  async deleteService(userId: string, serviceIndex: number): Promise<void> {
    const userObjectId = new Types.ObjectId(userId);
    
    const domainProfile = await this.domainProfileModel.findOne({ userId: userObjectId });
    
    if (!domainProfile) {
      throw new NotFoundException('Domain profile not found');
    }

    if (serviceIndex >= domainProfile.services.length || serviceIndex < 0) {
      throw new NotFoundException('Service not found at the specified index');
    }

    // Clean up service banner file if exists before deleting the service
    const serviceToDelete = domainProfile.services[serviceIndex];
    if (serviceToDelete.serviceBannerUrl) {
      await this.deleteFile(serviceToDelete.serviceBannerUrl);
    }

    // Remove the service at the specified index
    domainProfile.services.splice(serviceIndex, 1);
    
    await domainProfile.save();
  }

  /**
   * Toggle service active status
   * @param userId - User ID
   * @param serviceIndex - Index of the service to toggle
   * @returns Updated domain profile
   */
  async toggleServiceActive(userId: string, serviceIndex: number): Promise<DomainProfile> {
    const userObjectId = new Types.ObjectId(userId);
    
    const domainProfile = await this.domainProfileModel.findOne({ userId: userObjectId });
    
    if (!domainProfile) {
      throw new NotFoundException('Domain profile not found');
    }

    if (serviceIndex >= domainProfile.services.length || serviceIndex < 0) {
      throw new NotFoundException('Service not found at the specified index');
    }

    // Toggle the isActive status
    domainProfile.services[serviceIndex].isActive = !domainProfile.services[serviceIndex].isActive;
    
    await domainProfile.save();
    
    const updatedProfile = await this.domainProfileModel
      .findById(domainProfile._id)
      .populate('userId', 'firstName lastName email domainName')
      .exec();

    if (!updatedProfile) {
      throw new NotFoundException('Failed to retrieve updated domain profile');
    }

    return updatedProfile;
  }

  /**
   * Update service booking settings
   * @param userId - User ID
   * @param serviceId - Service ID within the domain profile
   * @param bookingSettings - Booking restriction and availability settings
   * @returns Updated domain profile
   */
  async updateServiceBookingSettings(
    userId: string, 
    serviceId: string, 
    bookingSettings: {
      bookingRestrictionActive?: boolean;
      bookingRestrictionTime?: string;
      multipleBookings?: boolean;
      hasCustomAvailability?: boolean;
      dateAvailability?: Array<{
        date: Date;
        enabled: boolean;
        morningEnabled: boolean;
        morningFrom: string;
        morningTo: string;
        afternoonEnabled: boolean;
        afternoonFrom: string;
        afternoonTo: string;
      }>;
    }
  ): Promise<DomainProfile> {
    const userObjectId = new Types.ObjectId(userId);
    
    const domainProfile = await this.domainProfileModel.findOne({ userId: userObjectId });
    
    if (!domainProfile) {
      throw new NotFoundException('Domain profile not found');
    }

    // Find the service by its _id
    const serviceIndex = domainProfile.services.findIndex(
      service => (service as any)._id.toString() === serviceId
    );

    if (serviceIndex === -1) {
      throw new NotFoundException('Service not found with the provided ID');
    }

    // Update only the provided booking settings
    const service = domainProfile.services[serviceIndex] as any;
    
    if (bookingSettings.bookingRestrictionActive !== undefined) {
      service.bookingRestrictionActive = bookingSettings.bookingRestrictionActive;
    }
    if (bookingSettings.bookingRestrictionTime !== undefined) {
      service.bookingRestrictionTime = bookingSettings.bookingRestrictionTime;
    }
    if (bookingSettings.multipleBookings !== undefined) {
      service.multipleBookings = bookingSettings.multipleBookings;
    }
    if (bookingSettings.hasCustomAvailability !== undefined) {
      service.hasCustomAvailability = bookingSettings.hasCustomAvailability;
    }
    if (bookingSettings.dateAvailability !== undefined) {
      service.dateAvailability = bookingSettings.dateAvailability;
    }

    await domainProfile.save();
    
    const updatedProfile = await this.domainProfileModel
      .findById(domainProfile._id)
      .populate('userId', 'firstName lastName email domainName')
      .exec();

    if (!updatedProfile) {
      throw new NotFoundException('Failed to retrieve updated domain profile');
    }

    return updatedProfile;
  }

  /**
   * Delete a file from the server
   * @param filePath - The file path to delete (relative URL like /uploads/domain-profiles/filename.jpg)
   */
  private async deleteFile(filePath: string): Promise<void> {
    try {
      // Convert relative URL to absolute file path
      const absolutePath = join(process.cwd(), filePath.replace(/^\//, ''));
      await fs.unlink(absolutePath);
      console.log(`Deleted file: ${absolutePath}`);
    } catch (error) {
      console.warn(`Failed to delete file ${filePath}:`, error.message);
    }
  }
}
