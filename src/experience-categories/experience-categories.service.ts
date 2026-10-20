import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as sharp from 'sharp';
import { ExperienceCategory } from '../schemas/experience-category.schema';
import { S3Service } from '../common/services/s3.service';
import { CreateExperienceCategoryDto } from './dto/create-experience-category.dto';
import { UpdateExperienceCategoryDto } from './dto/update-experience-category.dto';

@Injectable()
export class ExperienceCategoriesService {
  private readonly logger = new Logger(ExperienceCategoriesService.name);

  constructor(
    @InjectModel(ExperienceCategory.name) private experienceCategoryModel: Model<ExperienceCategory>,
    private readonly s3Service: S3Service,
  ) {}

  async findAll(page: number = 1, limit: number = 10, isActive?: boolean) {
    const skip = (page - 1) * limit;
    const filter: any = {};
    
    if (isActive !== undefined) {
      filter.isActive = isActive;
    }

    const [items, total] = await Promise.all([
      this.experienceCategoryModel.find(filter).skip(skip).limit(limit).sort({ category_name: 1 }).exec(),
      this.experienceCategoryModel.countDocuments(filter).exec(),
    ]);
    
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const category = await this.experienceCategoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`Experience category with ID ${id} not found`);
    }
    return category;
  }

  async create(createDto: CreateExperienceCategoryDto) {
    // Check if category name already exists
    const existingCategory = await this.experienceCategoryModel.findOne({ 
      category_name: createDto.category_name 
    }).exec();
    
    if (existingCategory) {
      throw new ConflictException(`Category with name "${createDto.category_name}" already exists`);
    }

    const newCategory = new this.experienceCategoryModel(createDto);
    return newCategory.save();
  }

  async update(id: string, updateDto: UpdateExperienceCategoryDto) {
    // If updating category_name, check for duplicates
    if (updateDto.category_name) {
      const existingCategory = await this.experienceCategoryModel.findOne({ 
        category_name: updateDto.category_name,
        _id: { $ne: id }
      }).exec();
      
      if (existingCategory) {
        throw new ConflictException(`Category with name "${updateDto.category_name}" already exists`);
      }
    }

    const updatedCategory = await this.experienceCategoryModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
      
    if (!updatedCategory) {
      throw new NotFoundException(`Experience category with ID ${id} not found`);
    }
    
    return updatedCategory;
  }

  async remove(id: string) {
    const category = await this.experienceCategoryModel.findById(id).exec();
    if (!category) {
      throw new NotFoundException(`Experience category with ID ${id} not found`);
    }

    await this.experienceCategoryModel.findByIdAndDelete(id).exec();
    await this.deleteS3ObjectSafe(category.imageUrl);
    return { message: 'Experience category deleted successfully' };
  }

  /**
   * Convert the uploaded image to webp, store it on S3 and save the URL.
   * A timestamped key is used so every upload gets a new URL (no stale cache).
   */
  async uploadImage(id: string, file: Express.Multer.File): Promise<{ imageUrl: string }> {
    const category = await this.findOne(id);

    let webpBuffer: Buffer;
    try {
      webpBuffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } catch (error) {
      this.logger.warn(`Invalid image for category ${id}: ${error.message}`);
      throw new BadRequestException('Invalid image file');
    }

    const key = `experience-categories/${id}-${Date.now()}.webp`;
    const { url } = await this.s3Service.uploadFileByKey(key, webpBuffer, 'image/webp');

    const previousUrl = category.imageUrl;
    category.imageUrl = url;
    await category.save();

    if (previousUrl && previousUrl !== url) {
      await this.deleteS3ObjectSafe(previousUrl);
    }

    return { imageUrl: url };
  }

  async deleteImage(id: string): Promise<{ success: boolean }> {
    const category = await this.findOne(id);
    const previousUrl = category.imageUrl;

    category.imageUrl = '';
    await category.save();

    await this.deleteS3ObjectSafe(previousUrl);
    return { success: true };
  }

  private async deleteS3ObjectSafe(url?: string): Promise<void> {
    if (!url) return;
    try {
      const key = this.extractS3Key(url);
      if (key) await this.s3Service.deleteFile(key);
    } catch (error) {
      this.logger.warn(`Failed to delete S3 image ${url}: ${error.message}`);
    }
  }

  private extractS3Key(url: string): string {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (host.includes('.amazonaws.com')) {
        // Path-style: s3.region.amazonaws.com/bucket/key
        if (host.startsWith('s3.')) {
          return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).slice(1).join('/'));
        }
        // Virtual-hosted-style: bucket.s3.region.amazonaws.com/key
        return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      }
    } catch (_) {
      // fall through
    }
    return '';
  }

  async toggleActive(id: string) {
    const category = await this.findOne(id);
    category.isActive = !category.isActive;
    await category.save();
    return category;
  }
}
