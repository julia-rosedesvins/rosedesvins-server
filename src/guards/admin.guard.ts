import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { UserRole } from '../schemas/user.schema';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    // Get token from cookie
    const token = request.cookies?.admin_token;
    
    if (!token) {
      throw new UnauthorizedException('Admin token not found');
    }

    try {
      // Verify and decode the JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      });

      // Check if the user has admin role
      if (payload.role !== UserRole.ADMIN) {
        throw new ForbiddenException('Access denied. Admin role required.');
      }

      // Add user info to request object for use in controllers
      request['user'] = payload;
      
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired admin token');
    }
  }
}
