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
    @Query('isParent') isParent?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    const isParentBool = isParent !== undefined ? isParent === 'true' : undefined;
    return this.regionsService.getAllRegions(pageNum, limitNum, isParentBool);
  }

  @Get('search')
  async searchRegions(@Query('q') query: string) {
    if (!query) {
      return [];
    }
    return this.regionsService.searchRegions(query);
  }

  @Get('unified-search')
  async unifiedSearch(@Query('q') query: string) {
    if (!query) {
      return {
        success: true,
        data: {
          type: null,
          results: []
        }
      };
    }
    return this.regionsService.unifiedSearch(query);
  }

  @Get(':name')
  async getRegionByName(
    @Param('name') name: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') searchQuery?: string,
    @Query('days') days?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('languages') languages?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    
    // Parse filter parameters
    const filters: any = {};
    if (days) {
      filters.days = days.split(',').map(d => d.trim());
    }
    if (minPrice) {
      filters.minPrice = parseFloat(minPrice);
    }
    if (maxPrice) {
      filters.maxPrice = parseFloat(maxPrice);
    }
    if (languages) {
      filters.languages = languages.split(',').map(l => l.trim());
    }
    
    return this.regionsService.getRegionByName(name, pageNum, limitNum, searchQuery, filters);
  }
}
