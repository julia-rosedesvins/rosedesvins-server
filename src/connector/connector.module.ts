import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConnectorController } from './connector.controller';
import { ConnectorService } from './connector.service';
import { Connector, ConnectorSchema } from '../schemas/connector.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Connector.name, schema: ConnectorSchema },
      { name: User.name, schema: UserSchema }
    ]),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [ConnectorController],
  providers: [ConnectorService],
  exports: [ConnectorService, MongooseModule]
})
export class ConnectorModule { }
