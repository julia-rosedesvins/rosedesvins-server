import { Controller, Post, Logger } from '@nestjs/common';
import { CitiesService } from './cities.service';

@Controller('cities')
export class CitiesController {
    private readonly logger = new Logger(CitiesController.name);

    constructor(private readonly citiesService: CitiesService) {}

    @Post('load')
    async loadCitiesFromJson() {
        this.logger.log('Loading cities from JSON file...');
        return await this.citiesService.loadCitiesFromJson();
    }
}
