import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CitiesService } from './cities.service';
import { CitiesController } from './cities.controller';
import { City, CitySchema } from '../schemas/city.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: City.name, schema: CitySchema },
    ]),
  ],
  controllers: [CitiesController],
  providers: [CitiesService],
  exports: [CitiesService],
})
export class CitiesModule {}
