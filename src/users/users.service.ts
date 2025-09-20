import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole, AccountStatus } from '../schemas/user.schema';
import { CreateAdminDto, AdminLoginDto } from '../validators/admin.validators';
import { ContactFormDto, UserActionDto } from '../validators/user.validators';
import { EmailService } from '../email/email.service';

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
}
