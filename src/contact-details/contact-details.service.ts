import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserRole, AccountStatus } from '../schemas/user.schema';

export interface UserContactDetails {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  domainName: string;
  address: string | null;
  codePostal: string | null;
  city: string | null;
  siteWeb: string | null;
}

export interface UpdateContactDetailsDto {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  domainName?: string;
  address?: string;
  codePostal?: string;
  city?: string;
  siteWeb?: string;
}

@Injectable()
export class ContactDetailsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async getCurrentUserDetails(userId: string): Promise<UserContactDetails> {
    const user = await this.userModel.findOne({
      _id: userId,
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] }
    }).select('firstName lastName email phoneNumber domainName address codePostal city siteWeb');

    if (!user) {
      throw new UnauthorizedException('User not found or access denied');
    }

    return {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      domainName: user.domainName,
      address: user.address,
      codePostal: user.codePostal,
      city: user.city,
      siteWeb: user.siteWeb,
    };
  }

  async updateCurrentUserDetails(userId: string, updateData: UpdateContactDetailsDto): Promise<UserContactDetails> {
    const user = await this.userModel.findOne({
      _id: userId,
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] }
    });

    if (!user) {
      throw new UnauthorizedException('User not found or access denied');
    }

    // Remove any undefined values and email field (for security)
    const filteredUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([key, value]) => value !== undefined && key !== 'email')
    );

    // Update the user with the filtered data
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      filteredUpdateData,
      { new: true, runValidators: true }
    ).select('firstName lastName email phoneNumber domainName address codePostal city siteWeb');

    if (!updatedUser) {
      throw new UnauthorizedException('Failed to update user details');
    }

    return {
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      domainName: updatedUser.domainName,
      address: updatedUser.address,
      codePostal: updatedUser.codePostal,
      city: updatedUser.city,
      siteWeb: updatedUser.siteWeb,
    };
  }
}
