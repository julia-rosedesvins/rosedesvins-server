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
    numberOfPeople: number;
    pricePerPerson: number;
    timeOfServiceInMinutes: number;
    numberOfWinesTasted: number;
    languagesOffered: string[];
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
      domainColor: domainProfileDto.domainColor,
      domainProfilePictureUrl,
      domainLogoUrl,
      services: domainProfileDto.services || []
    };

    if (existingDomainProfile) {
      // Update existing domain profile
      const updatedDomainProfile = await this.domainProfileModel.findByIdAndUpdate(
        existingDomainProfile._id,
        profileData,
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
      // Create new domain profile
      const newDomainProfile = new this.domainProfileModel(profileData);
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
   * @returns Updated domain profile
   */
  async addService(userId: string, serviceData: any): Promise<DomainProfile> {
    const userObjectId = new Types.ObjectId(userId);
    
    const mappedServiceData = {
      name: serviceData.serviceName,
      description: serviceData.serviceDescription,
      numberOfPeople: serviceData.numberOfPeople,
      pricePerPerson: serviceData.pricePerPerson,
      timeOfServiceInMinutes: serviceData.timeOfServiceInMinutes,
      numberOfWinesTasted: serviceData.numberOfWinesTasted,
      languagesOffered: serviceData.languagesOffered,
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
    
    // Map database fields back to API format
    return services.map(service => ({
      serviceName: service.name,
      serviceDescription: service.description,
      numberOfPeople: service.numberOfPeople,
      pricePerPerson: service.pricePerPerson,
      timeOfServiceInMinutes: service.timeOfServiceInMinutes,
      numberOfWinesTasted: service.numberOfWinesTasted,
      languagesOffered: service.languagesOffered,
      isActive: service.isActive
    }));
  }

  /**
   * Update a service by index
   * @param userId - User ID
   * @param serviceIndex - Index of the service to update
   * @param updateData - Update data
   * @returns Updated domain profile
   */
  async updateService(userId: string, serviceIndex: number, updateData: any): Promise<DomainProfile> {
    const userObjectId = new Types.ObjectId(userId);
    
    const domainProfile = await this.domainProfileModel.findOne({ userId: userObjectId });
    
    if (!domainProfile) {
      throw new NotFoundException('Domain profile not found');
    }

    if (serviceIndex >= domainProfile.services.length || serviceIndex < 0) {
      throw new NotFoundException('Service not found at the specified index');
    }

    console.log('Update data before mapping:', JSON.stringify(updateData, null, 2));

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
