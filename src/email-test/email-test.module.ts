import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { EmailTestController } from './email-test.controller';
import { EmailTestService } from './email-test.service';

@Module({
  imports: [EmailModule],
  controllers: [EmailTestController],
  providers: [EmailTestService],
})
export class EmailTestModule {}
