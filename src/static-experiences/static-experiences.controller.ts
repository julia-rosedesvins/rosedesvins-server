import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StaticExperiencesService } from './static-experiences.service';

@ApiTags('Static Experiences')
@Controller('static-experiences')
export class StaticExperiencesController {
  constructor(private readonly staticExperiencesService: StaticExperiencesService) {}

  @Post('load-data')
  @ApiOperation({ summary: 'Load static experiences from JSON file' })
  async loadData() {
    try {
      const createdIds = await this.staticExperiencesService.loadDataFromJson();
      
      return {
        success: true,
        message: `Successfully loaded ${createdIds.length} static experiences`,
        data: {
          count: createdIds.length,
          ids: createdIds
        }
      };
    } catch (error) {
      throw error;
    }
  }
}
