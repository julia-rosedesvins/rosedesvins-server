import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RegionsService } from './regions.service';
import { RegionsController } from './regions.controller';
import { Region, RegionSchema } from '../schemas/region.schema';
import { User, UserSchema } from '../schemas/user.schema';
import { DomainProfile, DomainProfileSchema } from '../schemas/domain-profile.schema';
import { StaticExperience, StaticExperienceSchema } from '../schemas/static-experience.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Region.name, schema: RegionSchema },
      { name: User.name, schema: UserSchema },
      { name: DomainProfile.name, schema: DomainProfileSchema },
      { name: StaticExperience.name, schema: StaticExperienceSchema },
    ]),
  ],
  controllers: [RegionsController],
  providers: [RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}
