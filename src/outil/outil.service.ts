import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Outil, OutilDocument } from '../schemas/outil.schema';
import { S3Service } from '../common/services/s3.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class OutilService implements OnModuleInit {
  private readonly logger = new Logger(OutilService.name);

  constructor(
    @InjectModel(Outil.name) private outilModel: Model<OutilDocument>,
    private readonly s3Service: S3Service,
  ) {}

  async onModuleInit() {
    await this.seedOutilImages();
  }

  /**
   * Seed outil images from docs/outil folder into S3 and DB (skips already seeded)
   */
  async seedOutilImages(): Promise<void> {
    const outilDir = path.join(process.cwd(), '..', 'docs', 'outil');

    if (!fs.existsSync(outilDir)) {
      this.logger.warn(`Outil directory not found: ${outilDir}`);
      return;
    }

    const files = fs.readdirSync(outilDir).filter(f =>
      /\.(webp|jpg|jpeg|png)$/i.test(f)
    );

    if (files.length === 0) {
      this.logger.warn('No images found in docs/outil directory');
      return;
    }

    const existing = await this.outilModel.countDocuments();
    if (existing >= files.length) {
      this.logger.log(`Outil images already seeded (${existing} records found)`);
      return;
    }

    this.logger.log(`Seeding ${files.length} outil images...`);

    for (const file of files) {
      const filePath = path.join(outilDir, file);
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(file).toLowerCase();
      const contentType = ext === '.webp' ? 'image/webp'
        : ext === '.png' ? 'image/png'
        : 'image/jpeg';

      // Check if already in DB by title
      const title = path.basename(file, ext);
      const exists = await this.outilModel.findOne({ title });
      if (exists) {
        this.logger.log(`Skipping already seeded: ${file}`);
        continue;
      }

      try {
        const { url } = await this.s3Service.uploadFile(buffer, file, 'outil');
        await this.outilModel.create({ title, thumbnail: url });
        this.logger.log(`Uploaded and saved: ${file} → ${url}`);
      } catch (error) {
        this.logger.error(`Failed to upload ${file}: ${error.message}`);
      }
    }

    this.logger.log('Outil seeding complete.');
  }

  async findAll(): Promise<OutilDocument[]> {
    return this.outilModel.find().sort({ title: 1 }).exec();
  }
}
