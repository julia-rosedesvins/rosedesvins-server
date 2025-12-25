import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole, AccountStatus } from '../schemas/user.schema';
import { Subscription } from '../schemas/subscriptions.schema';
import { CreateAdminDto, AdminLoginDto } from '../validators/admin.validators';
import { ContactFormDto, UserActionDto, UserLoginDto, ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto, UpdateUserDto } from '../validators/user.validators';
import { EmailService } from '../email/email.service';
import * as crypto from 'crypto';

export interface AdminLoginResponse {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
  };
  token: string;
}

export interface UserLoginResponse {
  user: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    domainName: string;
    mustChangePassword: boolean;
    firstLogin: boolean;
  };
  token: string;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedUsersResponse {
  users: User[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalUsers: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<Subscription>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async createAdminUser(createAdminDto: CreateAdminDto): Promise<User> {
    const { firstName, lastName, email, password, domainName } = createAdminDto;

    // Check if admin with this email already exists
    const existingAdmin = await this.userModel.findOne({ 
      email: email.toLowerCase(),
      role: UserRole.ADMIN 
    });

    if (existingAdmin) {
      throw new ConflictException('Admin with this email already exists');
    }

    // Hash the password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create admin user
    const adminUser = new this.userModel({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
      role: UserRole.ADMIN,
      domainName: domainName || 'Rose des Vins Admin',
      accountStatus: AccountStatus.ACTIVE,
      mustChangePassword: false,
      lastPasswordChange: new Date(),
      firstLoginAt: new Date(),
      submittedAt: new Date(),
      approvedBy: 'system',
      approvedAt: new Date(),
    });

    return await adminUser.save();
  }

  async adminLogin(adminLoginDto: AdminLoginDto): Promise<AdminLoginResponse> {
    const { email, password } = adminLoginDto;

    // Find admin user
    const admin = await this.userModel.findOne({
      email: email.toLowerCase(),
      role: UserRole.ADMIN,
      accountStatus: { $in: [AccountStatus.ACTIVE, AccountStatus.APPROVED] }
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid admin credentials');
    }

    // Check if account is suspended
    if (admin.accountStatus === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('Admin account is suspended');
    }

    // Check if account is locked
    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      throw new UnauthorizedException('Admin account is temporarily locked');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      // Increment login attempts
      admin.loginAttempts += 1;
      
      // Lock account if too many failed attempts (5 attempts)
      if (admin.loginAttempts >= 5) {
        admin.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
      }
      
      await admin.save();
      throw new UnauthorizedException('Invalid admin credentials');
    }

    // Reset login attempts on successful login
    admin.loginAttempts = 0;
    admin.lockedUntil = null as any;
    admin.lastLoginAt = new Date();
    
    // Set first login if not set
    if (!admin.firstLoginAt) {
      admin.firstLoginAt = new Date();
    }
    
    await admin.save();

    // Generate JWT token
    const payload = {
      sub: admin._id,
      email: admin.email,
      role: admin.role,
      firstName: admin.firstName,
      lastName: admin.lastName,
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: '24h', // Token expires in 24 hours
    });

    return {
      user: {
        id: (admin._id as any).toString(),
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
      },
      token,
    };
  }

  async userLogin(userLoginDto: UserLoginDto): Promise<UserLoginResponse> {
    const { email, password } = userLoginDto;

    // Find user
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] }
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials or account not approved');
    }

    // Check if account is suspended
    if (user.accountStatus === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('User account is suspended');
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('User account is temporarily locked');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Increment login attempts
      user.loginAttempts += 1;
      
      // Lock account if too many failed attempts (5 attempts)
      if (user.loginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
      }
      
      await user.save();
      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset login attempts on successful login
    user.loginAttempts = 0;
    user.lockedUntil = null as any;
    user.lastLoginAt = new Date();
    
    // Check if this is the first login
    const isFirstLogin = !user.firstLoginAt;
    if (isFirstLogin) {
      user.firstLoginAt = new Date();
    }
    
    await user.save();

    // Generate JWT token
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      domainName: user.domainName,
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: '24h', // Token expires in 24 hours
    });

    return {
      user: {
        id: (user._id as any).toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        domainName: user.domainName,
        mustChangePassword: user.mustChangePassword,
        firstLogin: isFirstLogin,
      },
      token,
    };
  }

  async quickLoginByEmail(email: string): Promise<UserLoginResponse> {
    // Find user by email only
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] }
    });

    if (!user) {
      throw new NotFoundException('User not found or account not approved');
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate JWT token
    const payload = {
      sub: user._id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      domainName: user.domainName,
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    return {
      user: {
        id: (user._id as any).toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        domainName: user.domainName,
        mustChangePassword: user.mustChangePassword,
        firstLogin: false,
      },
      token,
    };
  }

  async findAdminByEmail(email: string): Promise<User | null> {
    return await this.userModel.findOne({
      email: email.toLowerCase(),
      role: UserRole.ADMIN,
    });
  }

  async getAllAdmins(): Promise<User[]> {
    return await this.userModel.find({
      role: UserRole.ADMIN,
    }).select('-password');
  }

  async getAdminProfile(adminId: string): Promise<User> {
    const admin = await this.userModel.findOne({
      _id: adminId,
      role: UserRole.ADMIN,
      accountStatus: { $in: [AccountStatus.ACTIVE, AccountStatus.APPROVED] }
    }).select('-password');

    if (!admin) {
      throw new UnauthorizedException('Admin not found or access denied');
    }

    return admin;
  }

  async getUserProfile(userId: string): Promise<any> {
    const user = await this.userModel.findOne({
      _id: userId,
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.ACTIVE, AccountStatus.APPROVED] }
    }).select('-password -loginToken');

    if (!user) {
      throw new UnauthorizedException('User not found or access denied');
    }
    const userObjectId = new Types.ObjectId(userId);

    // Get user's current subscription
    const subscription = await this.subscriptionModel
      .findOne({ userId: userObjectId })
      .populate('cancelledById', 'firstName lastName email')
      .exec();

    const userObject = user.toObject();
    return {
      ...userObject,
      subscription: subscription?.toObject() || null
    };
  }

  async submitContactForm(contactFormDto: ContactFormDto): Promise<User> {
    const { firstName, lastName, email, domainName } = contactFormDto;

    // Check if user with this email already exists
    const existingUser = await this.userModel.findOne({ 
      email: email.toLowerCase() 
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Create new user with pending approval status
    const newUser = new this.userModel({
      firstName,
      lastName,
      email: email.toLowerCase(),
      domainName,
      role: UserRole.USER,
      accountStatus: AccountStatus.PENDING_APPROVAL,
      mustChangePassword: true,
      submittedAt: new Date(),
    });

    const savedUser = await newUser.save();

    // Send email notification to admin about new contact form submission
    try {
      await this.emailService.sendContactFormNotification({
        fullName: `${firstName} ${lastName}`,
        email: email.toLowerCase(),
        domain: domainName,
      });
    } catch (emailError) {
      console.error('Failed to send contact form notification email:', emailError);
      // Don't fail the user creation if email fails
    }

    return savedUser;
  }

  async getPendingApprovalUsers(query: PaginationQuery): Promise<PaginatedUsersResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10)); // Max 50 per page, default 10
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalUsers = await this.userModel.countDocuments({
      role: UserRole.USER,
      accountStatus: AccountStatus.PENDING_APPROVAL,
    });

    // Get users with pagination
    const users = await this.userModel
      .find({
        role: UserRole.USER,
        accountStatus: AccountStatus.PENDING_APPROVAL,
      })
      .select('-password -loginToken')
      .sort({ submittedAt: -1 }) // Most recent first
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalUsers / limit);

    return {
      users: users as User[],
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getApprovedUsers(query: PaginationQuery): Promise<PaginatedUsersResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10)); // Max 50 per page, default 10
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalUsers = await this.userModel.countDocuments({
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] },
    });

    // Get users with pagination
    const users = await this.userModel
      .find({
        role: UserRole.USER,
        accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] },
      })
      .select('-password -loginToken')
      .sort({ approvedAt: -1, createdAt: -1 }) // Most recently approved first
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalUsers / limit);

    return {
      users: users as User[],
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async getRejectedUsers(query: PaginationQuery): Promise<PaginatedUsersResponse> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(50, Math.max(1, query.limit || 10)); // Max 50 per page, default 10
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalUsers = await this.userModel.countDocuments({
      role: UserRole.USER,
      accountStatus: AccountStatus.REJECTED,
    });

    // Get users with pagination
    const users = await this.userModel
      .find({
        role: UserRole.USER,
        accountStatus: AccountStatus.REJECTED,
      })
      .select('-password -loginToken')
      .sort({ approvedAt: -1, createdAt: -1 }) // Most recently rejected first
      .skip(skip)
      .limit(limit)
      .lean();

    const totalPages = Math.ceil(totalUsers / limit);

    return {
      users: users as User[],
      pagination: {
        currentPage: page,
        totalPages,
        totalUsers,
        limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  private generateRandomPassword(length: number = 12): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one character from each category
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*';
    
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];
    
    // Fill the rest of the password length
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  async processUserAction(userActionDto: UserActionDto, adminId: string): Promise<User> {
    const { userId, action } = userActionDto;

    // Find the user
    const user = await this.userModel.findOne({
      _id: userId,
      role: UserRole.USER,
      accountStatus: AccountStatus.PENDING_APPROVAL,
    });

    if (!user) {
      throw new NotFoundException('User not found or not in pending approval status');
    }

    if (action === 'approve') {
      // Generate random password
      const randomPassword = this.generateRandomPassword();
      const saltRounds = 12;
  
      const hashedPassword = await bcrypt.hash(randomPassword, saltRounds);

      // Update user status to approved
      user.accountStatus = AccountStatus.APPROVED;
      user.password = hashedPassword;
      user.approvedBy = adminId;
      user.approvedAt = new Date();
      user.mustChangePassword = true;

      const savedUser = await user.save();

      // Create default subscription for 1 month
      try {
        const currentDate = new Date();
        const endDate = new Date(currentDate);
        endDate.setMonth(currentDate.getMonth() + 1); // Add 1 month

        const subscription = new this.subscriptionModel({
          userId: savedUser._id,
          adminId: new Types.ObjectId(adminId),
          startDate: currentDate,
          endDate: endDate,
          isActive: true,
          notes: '',
        });

        await subscription.save();
        this.logger.log(`Created default 1-month subscription for user ${savedUser.email}`);
      } catch (subscriptionError) {
        this.logger.error('Failed to create default subscription:', subscriptionError);
        // Don't fail the approval process if subscription creation fails
        // The user is still approved, but without a subscription
      }

      // Send welcome email with account details
      try {
        await this.emailService.sendWelcomeEmail({
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          password: randomPassword,
          domain: user.domainName,
        });
      } catch (emailError) {
        this.logger.error('Failed to send welcome email:', emailError);
        // Don't fail the approval process if email fails
      }

      return savedUser;

    } else if (action === 'reject') {
      // Update user status to rejected
      user.accountStatus = AccountStatus.REJECTED;
      user.approvedBy = adminId;
      user.approvedAt = new Date();

      const savedUser = await user.save();

      // Send rejection email
      try {
        await this.emailService.sendRejectionEmail({
          fullName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          domain: user.domainName,
        });
      } catch (emailError) {
        this.logger.error('Failed to send rejection email:', emailError);
        // Don't fail the rejection process if email fails
      }

      return savedUser;
    }

    throw new BadRequestException('Invalid action specified');
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userModel.findById(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // If email is being updated, check if it's already taken
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.userModel.findOne({ email: updateUserDto.email.toLowerCase() });
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    // Update fields
    if (updateUserDto.firstName) user.firstName = updateUserDto.firstName;
    if (updateUserDto.lastName) user.lastName = updateUserDto.lastName;
    if (updateUserDto.email) user.email = updateUserDto.email.toLowerCase();
    if (updateUserDto.domainName) user.domainName = updateUserDto.domainName;
    if (updateUserDto.phoneNumber !== undefined) user.phoneNumber = updateUserDto.phoneNumber;
    if (updateUserDto.address !== undefined) user.address = updateUserDto.address;
    if (updateUserDto.codePostal !== undefined) user.codePostal = updateUserDto.codePostal;
    if (updateUserDto.city !== undefined) user.city = updateUserDto.city;
    if (updateUserDto.siteWeb !== undefined) user.siteWeb = updateUserDto.siteWeb;

    return await user.save();
  }

  async changeUserPassword(changePasswordDto: ChangePasswordDto, userId: string): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;

    // Find the user
    const user = await this.userModel.findOne({
      _id: userId,
      role: UserRole.USER,
      accountStatus: { $in: [AccountStatus.APPROVED, AccountStatus.ACTIVE] }
    });

    if (!user) {
      throw new UnauthorizedException('User not found or access denied');
    }

    // If mustChangePassword is false, verify current password
    if (!user.mustChangePassword) {
      if (!currentPassword) {
        throw new BadRequestException('Current password is required');
      }

      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);

      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }

      // Check if new password is different from current password
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        throw new BadRequestException('New password must be different from current password');
      }
    }

    // Hash the new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password and related fields
    user.password = hashedNewPassword;
    user.mustChangePassword = false;
    user.lastPasswordChange = new Date();
    
    await user.save();

    this.logger.log(`User ${user.email} successfully changed password`);

    return {
      message: 'Password changed successfully'
    };
  }

  async changeAdminPassword(changePasswordDto: ChangePasswordDto, adminId: string): Promise<{ message: string }> {
    const { currentPassword, newPassword } = changePasswordDto;

    // Find the admin
    const admin = await this.userModel.findOne({
      _id: adminId,
      role: UserRole.ADMIN,
      accountStatus: { $in: [AccountStatus.ACTIVE, AccountStatus.APPROVED] }
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found or access denied');
    }

    if (!currentPassword) {
      throw new BadRequestException('Current password is required');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, admin.password);

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Check if new password is different from current password
    const isSamePassword = await bcrypt.compare(newPassword, admin.password);
    if (isSamePassword) {
      throw new BadRequestException('New password must be different from current password');
    }

    // Hash the new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update admin password and related fields
    admin.password = hashedNewPassword;
    admin.mustChangePassword = false;
    admin.lastPasswordChange = new Date();
    
    await admin.save();

    this.logger.log(`Admin ${admin.email} successfully changed password`);

    return {
      message: 'Admin password changed successfully'
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;
    const user = await this.userModel.findOne({ email: email.toLowerCase() });

    if (!user) {
      // We return success even if user not found to prevent email enumeration
      return { message: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.' };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save token to user
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // Send email
    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
    
    try {
      await this.emailService.sendResetPasswordEmail({
        fullName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        resetUrl,
      });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      throw new InternalServerErrorException('Erreur lors de l\'envoi de l\'email');
    }

    return { message: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userModel.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      throw new BadRequestException('Le lien de réinitialisation est invalide ou a expiré.');
    }

    // Hash new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.lastPasswordChange = new Date();
    
    // If user was pending approval or something, maybe we should check status?
    // But usually reset password implies they can login now if they are active.
    
    await user.save();

    return { message: 'Votre mot de passe a été réinitialisé avec succès.' };
  }
}
