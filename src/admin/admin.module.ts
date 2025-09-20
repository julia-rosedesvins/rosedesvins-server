import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    UsersModule, // Import UsersModule to get AdminGuard
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
