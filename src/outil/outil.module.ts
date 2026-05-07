import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { OutilService } from './outil.service';
import { OutilController } from './outil.controller';
import { Outil, OutilSchema } from '../schemas/outil.schema';
import { S3Service } from '../common/services/s3.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Outil.name, schema: OutilSchema }]),
    ConfigModule,
  ],
  controllers: [OutilController],
  providers: [OutilService, S3Service],
  exports: [OutilService],
})
export class OutilModule {}
