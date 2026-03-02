import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { StaticExperience } from '../schemas/static-experience.schema';
import { CreateStaticExperienceDto } from './dto/create-static-experience.dto';
import { UpdateStaticExperienceDto } from './dto/update-static-experience.dto';
import { S3Service } from '../common/services/s3.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StaticExperiencesService {
  private readonly logger = new Logger(StaticExperiencesService.name);

  constructor(
    @InjectModel(StaticExperience.name) private staticExperienceModel: Model<StaticExperience>,
    private readonly s3Service: S3Service,
  ) {}

  async loadDataFromJson(): Promise<string[]> {
    try {
      // Read JSON file
      const filePath = path.join(process.cwd(), '..', 'docs', 'csvjson.json');
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);

      this.logger.log(`Loading ${data.length} static experiences from JSON file`);

      // Clear existing data
      await this.staticExperienceModel.deleteMany({});
      this.logger.log('Cleared existing static experiences');

      // Transform and insert data
      const experiencesToInsert = data.map((item: any) => {
        // Parse opening_hours string into Map format
        let openingHoursMap: Map<string, string[]> | null = null;
        if (item.opening_hours && item.opening_hours.trim() !== '') {
          openingHoursMap = this.parseOpeningHours(item.opening_hours);
        }

        return {
          name: item.name || '',
          category: item.category || null,
          address: item.address || null,
          city: item.city || null,
          latitude: item.latitude || null,
          longitude: item.longitude || null,
          rating: item.rating || null,
          reviews: item.reviews || 0,
          website: item.website || null,
          phone: item.phone || null,
          opening_hours: openingHoursMap,
          main_image: item.main_image || null,
          image_1: item.image_1 || null,
          image_2: item.image_2 || null,
          about: item.about || null,
          url: item.url || null,
        };
      });

      // Insert all experiences
      const insertedDocs = await this.staticExperienceModel.insertMany(experiencesToInsert);
      const createdIds = insertedDocs.map(doc => doc._id.toString());

      this.logger.log(`Successfully inserted ${createdIds.length} static experiences`);
      return createdIds;
    } catch (error) {
      this.logger.error('Error loading static experiences from JSON', error);
      throw error;
    }
  }

  private parseOpeningHours(openingHoursString: string): Map<string, string[]> | null {
    try {
      const openingHoursMap = new Map<string, string[]>();
      
      // Split by newline or comma to get individual day entries
      const dayEntries = openingHoursString.split(/\n|,\s*(?=[A-Z])/);
      
      for (const entry of dayEntries) {
        if (!entry.trim()) continue;
        
        // Match pattern like "Monday: 10 AM–12 PM, 2–7 PM"
        const match = entry.match(/^([A-Za-z]+):\s*(.+)$/);
        if (match) {
          const day = match[1].trim();
          const hours = match[2].trim();
          
          // Split multiple time ranges for the same day
          const timeRanges = hours.split(/,\s*/).filter(range => range.trim() !== '' && range.toLowerCase() !== 'closed');
          
          if (timeRanges.length > 0) {
            openingHoursMap.set(day, timeRanges);
          }
        }
      }
      
      return openingHoursMap.size > 0 ? openingHoursMap : null;
    } catch (error) {
      this.logger.warn('Failed to parse opening hours:', openingHoursString);
      return null;
    }
  }

  async getPublicExperienceById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Static experience with ID ${id} not found`);
    }

    const experience = await this.staticExperienceModel.findById(id).exec();
    if (!experience) {
      throw new NotFoundException(`Static experience with ID ${id} not found`);
    }

    const buildFullUrl = (url: string | null | undefined): string | null => {
      if (!url) return null;
      return url;
    };

    return {
      domainProfile: {
        _id: experience._id,
        userId: '',
        domainDescription: experience.domain_description || experience.about || experience.category || '',
        domainProfilePictureUrl: buildFullUrl(experience.domain_profile_pic_url || experience.main_image),
        domainLogoUrl: buildFullUrl(experience.domain_logo_url),
        colorCode: '#3A7B59',
        services: [],
        domainName: experience.domain_name || experience.name,
        siteWeb: experience.website || null,
      },
      location: {
        domainLatitude: experience.latitude || null,
        domainLongitude: experience.longitude || null,
        address: experience.address || null,
        city: experience.city || null,
        codePostal: null,
      }
    };
  }

  // CRUD Operations
  async findAll(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.staticExperienceModel.find().skip(skip).limit(limit).exec(),
      this.staticExperienceModel.countDocuments().exec(),
    ]);
    return { items, total, page, limit };
  }

  async findOne(id: string) {
    const experience = await this.staticExperienceModel.findById(id).exec();
    if (!experience) {
      throw new NotFoundException(`Static experience with ID ${id} not found`);
    }
    return experience;
  }

  async create(createDto: CreateStaticExperienceDto) {
    const newExperience = new this.staticExperienceModel(createDto);
    return newExperience.save();
  }

  async update(id: string, updateDto: UpdateStaticExperienceDto) {
    const updatedExperience = await this.staticExperienceModel
      .findByIdAndUpdate(id, updateDto, { new: true })
      .exec();
    if (!updatedExperience) {
      throw new NotFoundException(`Static experience with ID ${id} not found`);
    }
    return updatedExperience;
  }

  async remove(id: string) {
    const experience = await this.staticExperienceModel.findById(id).exec();
    if (!experience) {
      throw new NotFoundException(`Static experience with ID ${id} not found`);
    }

    // Delete main image from S3 if it exists
    if (experience.main_image) {
      try {
        await this.s3Service.deleteFile(this.extractS3KeyFromUrl(experience.main_image));
      } catch (error) {
        this.logger.warn(`Failed to delete main image for experience ${id}`, error);
      }
    }

    // Delete domain profile picture from S3 if it exists
    if (experience.domain_profile_pic_url) {
      try {
        await this.s3Service.deleteFile(this.extractS3KeyFromUrl(experience.domain_profile_pic_url));
      } catch (error) {
        this.logger.warn(`Failed to delete domain profile picture for experience ${id}`, error);
      }
    }

    // Delete domain logo from S3 if it exists
    if (experience.domain_logo_url) {
      try {
        await this.s3Service.deleteFile(this.extractS3KeyFromUrl(experience.domain_logo_url));
      } catch (error) {
        this.logger.warn(`Failed to delete domain logo for experience ${id}`, error);
      }
    }

    await this.staticExperienceModel.findByIdAndDelete(id).exec();
    return { message: 'Static experience deleted successfully' };
  }

  async uploadMainImage(id: string, file: Express.Multer.File): Promise<string> {
    const experience = await this.findOne(id);

    // Delete old image if exists
    if (experience.main_image) {
      try {
        await this.s3Service.deleteFile(this.extractS3KeyFromUrl(experience.main_image));
      } catch (error) {
        this.logger.warn(`Failed to delete old main image for experience ${id}`, error);
      }
    }

    // Upload new image
    const { url: imageUrl } = await this.s3Service.uploadFile(file, undefined, 'static-experiences');
    await this.staticExperienceModel.findByIdAndUpdate(id, { main_image: imageUrl }).exec();
    return imageUrl;
  }

  async deleteMainImage(id: string) {
    const experience = await this.findOne(id);
    if (!experience.main_image) {
      throw new NotFoundException('No main image found for this experience');
    }

    await this.s3Service.deleteFile(this.extractS3KeyFromUrl(experience.main_image));
    await this.staticExperienceModel.findByIdAndUpdate(id, { main_image: null }).exec();
    return { message: 'Main image deleted successfully' };
  }

  async uploadDomainProfilePic(id: string, file: Express.Multer.File): Promise<string> {
    const experience = await this.findOne(id);

    if (experience.domain_profile_pic_url) {
      try {
        await this.s3Service.deleteFile(this.extractS3KeyFromUrl(experience.domain_profile_pic_url));
      } catch (error) {
        this.logger.warn(`Failed to delete old domain profile picture for experience ${id}`, error);
      }
    }

    const { url } = await this.s3Service.uploadFile(file, undefined, 'static-experiences/domain-profile-pics');
    await this.staticExperienceModel.findByIdAndUpdate(id, { domain_profile_pic_url: url }).exec();
    return url;
  }

  async uploadDomainLogo(id: string, file: Express.Multer.File): Promise<string> {
    const experience = await this.findOne(id);

    if (experience.domain_logo_url) {
      try {
        await this.s3Service.deleteFile(this.extractS3KeyFromUrl(experience.domain_logo_url));
      } catch (error) {
        this.logger.warn(`Failed to delete old domain logo for experience ${id}`, error);
      }
    }

    const { url } = await this.s3Service.uploadFile(file, undefined, 'static-experiences/domain-logos');
    await this.staticExperienceModel.findByIdAndUpdate(id, { domain_logo_url: url }).exec();
    return url;
  }

  private extractS3KeyFromUrl(url: string): string {
    const urlParts = url.split('.amazonaws.com/');
    return urlParts[1] || url;
  }
}
