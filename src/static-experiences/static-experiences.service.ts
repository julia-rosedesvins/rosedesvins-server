import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StaticExperience } from '../schemas/static-experience.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class StaticExperiencesService {
  private readonly logger = new Logger(StaticExperiencesService.name);

  constructor(
    @InjectModel(StaticExperience.name) private staticExperienceModel: Model<StaticExperience>,
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
}
