import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { Subscription, SubscriptionSchema } from '../schemas/subscriptions.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { JwtModule } from '@nestjs/jwt';
import { EmailModule } from '../email/email.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Subscription.name, schema: SubscriptionSchema },
            { name: User.name, schema: UserSchema }
        ]),
        EmailModule,
        JwtModule.register({
            secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
            signOptions: { expiresIn: '24h' },
        }),
    ],
    controllers: [SubscriptionController],
    providers: [SubscriptionService],
    exports: [SubscriptionService]
})
export class SubscriptionModule { }
