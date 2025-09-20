import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User, UserRole, AccountStatus } from '../schemas/user.schema';

export interface CreateAdminDto {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  domainName?: string;
}

export interface AdminLoginDto {
  email: string;
  password: string;
}

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

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
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
}
