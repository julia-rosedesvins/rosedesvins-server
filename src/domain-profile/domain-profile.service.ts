import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { User } from '../schemas/user.schema';

export interface CreateOrUpdateDomainProfileServiceDto {
  domainName: string;
  domainDescription: string;
  domainProfilePictureUrl?: string;
  domainLogoUrl?: string;
  colorCode: string;
  services: Array<{
    name: string;
    description: string;
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
    domainProfileDto: CreateOrUpdateDomainProfileServiceDto
  ): Promise<{
    domainProfile: DomainProfile;
    isNew: boolean;
  }> {
    const userObjectId = new Types.ObjectId(userId);

    // Update user's domain name
    await this.userModel.findByIdAndUpdate(
      userObjectId,
      { domainName: domainProfileDto.domainName },
      { new: true }
    );

    // Check if domain profile already exists
    const existingDomainProfile = await this.domainProfileModel.findOne({
      userId: userObjectId
    });

    const profileData = {
      userId: userObjectId,
      domainDescription: domainProfileDto.domainDescription,
      domainProfilePictureUrl: domainProfileDto.domainProfilePictureUrl,
      domainLogoUrl: domainProfileDto.domainLogoUrl,
      colorCode: domainProfileDto.colorCode,
      services: domainProfileDto.services
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
}
