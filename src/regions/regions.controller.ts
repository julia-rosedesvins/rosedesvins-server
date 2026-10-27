import { Controller, Post, Get, Query, Param, UseGuards, Put, Delete, Body, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import { CitiesService } from '../cities/cities.service';
import { AdminGuard } from '../guards/admin.guard';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

@ApiTags('Regions')
@Controller('regions')
export class RegionsController {
  constructor(
    private readonly regionsService: RegionsService,
    private readonly citiesService: CitiesService,
  ) {}

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

  @Get('by-coords')
  async getRegionByCoords(
    @Query('lat') lat: string,
    @Query('lon') lon: string,
  ) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || isNaN(lonNum)) {
      return { region: null };
    }
    const region = await this.regionsService.getRegionByCoords(latNum, lonNum);
    return { region };
  }

  @Get('test-city-to-region')
  @ApiOperation({
    summary: 'Test: resolve city name → closest region',
    description:
      'Looks up the city by name in the cities table, takes its coordinates, then returns the closest/containing region. Useful for debugging city → region resolution.',
  })
  @ApiQuery({ name: 'city', required: true, description: 'City name (e.g. Dijon, Tours, Montpellier)', example: 'Dijon' })
  async testCityToRegion(@Query('city') city: string) {
    if (!city || city.trim().length < 2) {
      return { error: 'Please provide a city name (at least 2 characters)' };
    }

    // Search the cities table for the best match
    const cityResult = await this.citiesService.searchCities(city.trim());
    const cityData = cityResult?.data?.[0] ?? cityResult?.[0] ?? null;

    if (!cityData) {
      return {
        query: city,
        city: null,
        region: null,
        message: `No city found matching "${city}"`,
      };
    }

    const lat: number = cityData.latitude_centre;
    const lon: number = cityData.longitude_centre;

    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      return {
        query: city,
        city: cityData,
        region: null,
        message: 'City found but has no coordinates',
      };
    }

    const region = await this.regionsService.getRegionByCoords(lat, lon);

    return {
      query: city,
      city: {
        name: cityData.nom_standard,
        latitude: lat,
        longitude: lon,
      },
      region: region
        ? {
            denom: region.denom,
            isParent: region.isParent,
            bounds: {
              min_lat: region.min_lat,
              min_lon: region.min_lon,
              max_lat: region.max_lat,
              max_lon: region.max_lon,
            },
          }
        : null,
      message: region
        ? `City "${cityData.nom_standard}" maps to region "${region.denom}"`
        : 'No matching region found',
    };
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

  @Get('sitemap-paths')
  @ApiOperation({
    summary: 'All public region/experience slug paths (for sitemap.xml generation)',
    description:
      'Returns every currently reachable `/region/{slug}` and `/experience/{regionSlug}/{domainSlug}` path, ' +
      'covering ALL Regions, DomainProfiles and StaticExperiences that have a slug — including domains with no ' +
      'active services, which are otherwise invisible to the services-listing endpoint. Only slug-based paths are ' +
      'returned (never a raw Mongo ID), so consumers can build the sitemap directly from this list.',
  })
  @ApiResponse({ status: 200, description: 'Lists of region and experience paths with their last-modified date.' })
  async getSitemapPaths() {
    return this.regionsService.getAllPublicSlugPaths();
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
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
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
    
    const coords = lat && lon ? { lat: parseFloat(lat), lon: parseFloat(lon) } : undefined;
    return this.regionsService.getRegionByName(name, pageNum, limitNum, searchQuery, filters, coords);
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

  @Post('admin/convert-thumbnails-to-webp')
  // @UseGuards(AdminGuard)
  async convertThumbnailsToWebp() {
    return this.regionsService.convertThumbnailsToWebp();
  }

  @Post('admin/backfill-slugs')
  @ApiOperation({
    summary: 'Backfill SEO slugs (regions, domain profiles, static experiences)',
    description:
      'One-off / idempotent migration endpoint: computes and persists a unique `slug` field for every Region, ' +
      'DomainProfile and StaticExperience document that does not have one yet. Safe to call multiple times — ' +
      'documents that already have a slug are left untouched. Run this after deploying the slug-URL feature ' +
      'so existing production data gets clean SEO-friendly URLs (e.g. /region/vouvray, /experience/vouvray/domaine-de-vodanis).',
  })
  @ApiResponse({ status: 200, description: 'Backfill summary with counts of documents updated per collection.' })
  async backfillSlugs() {
    return this.regionsService.backfillAllSlugs();
  }
}
