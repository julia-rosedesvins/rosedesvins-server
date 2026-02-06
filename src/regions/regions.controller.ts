import { Controller, Post, Get, Query, Param, UseGuards, Put, Delete, Body, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RegionsService } from './regions.service';
import { AdminGuard } from '../guards/admin.guard';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

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
    // Ensure query is properly trimmed and validated
    const trimmedQuery = query?.trim();
    
    if (!trimmedQuery || trimmedQuery.length === 0) {
      return {
        success: true,
        data: {
          type: null,
          services: [],
          domains: [],
          regions: [],
          staticExperiences: [],
          suggestedRoute: ''
        }
      };
    }
    
    return this.regionsService.unifiedSearch(trimmedQuery);
  }

  @Get(':name')
  async getRegionByName(
    @Param('name') name: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') searchQuery?: string,
    @Query('date') date?: string,
    @Query('days') days?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('languages') languages?: string,
    @Query('categories') categories?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    
    // Parse filter parameters
    const filters: any = {};
    if (date) {
      filters.date = date;
    }
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
    if (categories) {
      filters.categories = categories.split(',').map(c => c.trim());
    }
    
    return this.regionsService.getRegionByName(name, pageNum, limitNum, searchQuery, filters);
  }

  // Admin CRUD endpoints
  @Post('admin/create')
  @UseGuards(AdminGuard)
  async createRegion(@Body() createRegionDto: CreateRegionDto) {
    return this.regionsService.createRegion(createRegionDto);
  }

  @Put('admin/:id')
  @UseGuards(AdminGuard)
  async updateRegion(
    @Param('id') id: string,
    @Body() updateRegionDto: UpdateRegionDto,
  ) {
    return this.regionsService.updateRegion(id, updateRegionDto);
  }

  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  async deleteRegion(@Param('id') id: string) {
    return this.regionsService.deleteRegion(id);
  }

  @Post('admin/:id/thumbnail')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadThumbnail(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.regionsService.uploadRegionThumbnail(id, file);
  }

  @Delete('admin/:id/thumbnail')
  @UseGuards(AdminGuard)
  async deleteThumbnail(@Param('id') id: string) {
    return this.regionsService.deleteRegionThumbnail(id);
  }
}
