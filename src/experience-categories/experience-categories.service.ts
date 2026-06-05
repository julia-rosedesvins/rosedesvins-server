import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ExperienceCategory } from '../schemas/experience-category.schema';
import { CreateExperienceCategoryDto } from './dto/create-experience-category.dto';
import { UpdateExperienceCategoryDto } from './dto/update-experience-category.dto';

@Injectable()
export class ExperienceCategoriesService {
  private readonly logger = new Logger(ExperienceCategoriesService.name);

  constructor(
    @InjectModel(ExperienceCategory.name) private experienceCategoryModel: Model<ExperienceCategory>,
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
    return { message: 'Experience category deleted successfully' };
  }

  async toggleActive(id: string) {
    const category = await this.findOne(id);
    category.isActive = !category.isActive;
    await category.save();
    return category;
  }
}
