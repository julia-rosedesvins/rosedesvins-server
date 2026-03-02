import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StaticExperiencesService } from './static-experiences.service';
import { CreateStaticExperienceDto } from './dto/create-static-experience.dto';
import { UpdateStaticExperienceDto } from './dto/update-static-experience.dto';
import { AdminGuard } from '../guards/admin.guard';

@ApiTags('Static Experiences')
@Controller('static-experiences')
export class StaticExperiencesController {
  constructor(private readonly staticExperiencesService: StaticExperiencesService) {}

  @Post('load-data')
  @ApiOperation({ summary: 'Load static experiences from JSON file' })
  @UseGuards(AdminGuard)
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

  @Get('admin')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get all static experiences with pagination' })
  async findAll(@Query('page') page: number = 1, @Query('limit') limit: number = 10) {
    return this.staticExperiencesService.findAll(page, limit);
  }

  @Get('public/:id')
  @ApiOperation({ summary: 'Get public static experience by ID for experience page' })
  async getPublicById(@Param('id') id: string) {
    const data = await this.staticExperiencesService.getPublicExperienceById(id);
    return {
      success: true,
      message: 'Static experience retrieved successfully',
      data,
    };
  }

  @Get('admin/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get a static experience by ID' })
  async findOne(@Param('id') id: string) {
    return this.staticExperiencesService.findOne(id);
  }

  @Post('admin')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Create a new static experience' })
  async create(@Body() createDto: CreateStaticExperienceDto) {
    return this.staticExperiencesService.create(createDto);
  }

  @Put('admin/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update a static experience' })
  async update(@Param('id') id: string, @Body() updateDto: UpdateStaticExperienceDto) {
    return this.staticExperiencesService.update(id, updateDto);
  }

  @Delete('admin/:id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete a static experience' })
  async remove(@Param('id') id: string) {
    return this.staticExperiencesService.remove(id);
  }

  @Post('admin/:id/image')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload main image for a static experience' })
  async uploadMainImage(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const imageUrl = await this.staticExperiencesService.uploadMainImage(id, file);
    return { imageUrl };
  }

  @Post('admin/:id/domain-profile-pic')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload domain profile picture for a static experience' })
  async uploadDomainProfilePic(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const imageUrl = await this.staticExperiencesService.uploadDomainProfilePic(id, file);
    return { imageUrl };
  }

  @Post('admin/:id/domain-logo')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload domain logo for a static experience' })
  async uploadDomainLogo(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const imageUrl = await this.staticExperiencesService.uploadDomainLogo(id, file);
    return { imageUrl };
  }

  @Delete('admin/:id/image')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Delete main image from a static experience' })
  async deleteMainImage(@Param('id') id: string) {
    return this.staticExperiencesService.deleteMainImage(id);
  }
}
