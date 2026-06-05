import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Patch } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ExperienceCategoriesService } from './experience-categories.service';
import { CreateExperienceCategoryDto } from './dto/create-experience-category.dto';
import { UpdateExperienceCategoryDto } from './dto/update-experience-category.dto';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('Experience Categories')
@Controller('experience-categories')
export class ExperienceCategoriesController {
  constructor(private readonly experienceCategoriesService: ExperienceCategoriesService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get all active experience categories (public)' })
  async getActiveCategories() {
    const result = await this.experienceCategoriesService.findAll(1, 1000, true);
    return result.items;
  }

  @Get('admin')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get all experience categories with pagination' })
  async findAll(
    @Query('page') page: number = 1, 
    @Query('limit') limit: number = 10,
    @Query('isActive') isActive?: boolean
  ) {
    return this.experienceCategoriesService.findAll(page, limit, isActive);
  }

  @Get('admin/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get an experience category by ID' })
  async findOne(@Param('id') id: string) {
    return this.experienceCategoriesService.findOne(id);
  }

  @Post('admin')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a new experience category' })
  async create(@Body() createDto: CreateExperienceCategoryDto) {
    return this.experienceCategoriesService.create(createDto);
  }

  @Put('admin/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update an experience category' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateExperienceCategoryDto) {
    return this.experienceCategoriesService.update(id, updateDto);
  }

  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete an experience category' })
  async remove(@Param('id') id: string) {
    return this.experienceCategoriesService.remove(id);
  }

  @Patch('admin/:id/toggle-active')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Toggle category active status' })
  async toggleActive(@Param('id') id: string) {
    return this.experienceCategoriesService.toggleActive(id);
  }
}
