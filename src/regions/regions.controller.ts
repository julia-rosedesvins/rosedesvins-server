import { Controller, Post, Get, Query, Param, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { AdminGuard } from '../guards/admin.guard';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Post('load-data')
  // @UseGuards(AdminGuard)
  async loadRegionsData() {
    return this.regionsService.loadRegionsFromJson();
  }

  @Get()
  async getAllRegions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.regionsService.getAllRegions(pageNum, limitNum);
  }

  @Get('search')
  async searchRegions(@Query('q') query: string) {
    if (!query) {
      return [];
    }
    return this.regionsService.searchRegions(query);
  }

  @Get(':name')
  async getRegionByName(@Param('name') name: string) {
    return this.regionsService.getRegionByName(name);
  }
}
