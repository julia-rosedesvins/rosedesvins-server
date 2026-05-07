import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OutilService } from './outil.service';

@ApiTags('Outil')
@Controller('outil')
export class OutilController {
  constructor(private readonly outilService: OutilService) {}

  @Get()
  @ApiOperation({ summary: 'Get all outil thumbnails' })
  async findAll() {
    const data = await this.outilService.findAll();
    return { success: true, data };
  }

  @Post('seed')
  @ApiOperation({
    summary: 'Seed outil images from docs/outil folder',
    description: 'Reads images from the docs/outil directory, uploads them to S3 under the outil/ prefix, and saves the URLs to the database. Skips already-seeded entries.',
  })
  async seed() {
    await this.outilService.seedOutilImages();
    const data = await this.outilService.findAll();
    return { success: true, message: 'Seeding complete', count: data.length, data };
  }
}
