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
