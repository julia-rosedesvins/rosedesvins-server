import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Region } from '../schemas/region.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RegionsService {
    private readonly logger = new Logger(RegionsService.name);

    constructor(
        @InjectModel(Region.name) private regionModel: Model<Region>,
    ) { }

    async loadRegionsFromJson(): Promise<{ success: boolean; message: string; count: number }> {
        try {
            // Path to the JSON file
            const jsonFilePath = path.join(process.cwd(), '..', 'docs', 'region.json');

            this.logger.log(`Reading regions from: ${jsonFilePath}`);

            // Check if file exists
            if (!fs.existsSync(jsonFilePath)) {
                throw new Error(`File not found: ${jsonFilePath}`);
            }

            // Read the JSON file
            const fileContent = fs.readFileSync(jsonFilePath, 'utf-8');
            const regionsData = JSON.parse(fileContent);

            // Filter out entries where Relevant is empty or not "Yes", and remove the Relevant field
            const filteredRegions = regionsData
                .filter((region: any) => region.Relevant === 'Yes')
                .map((region: any) => ({
                    denom: region.denom,
                    min_lat: region.min_lat,
                    min_lon: region.min_lon,
                    max_lat: region.max_lat,
                    max_lon: region.max_lon,
                    thumbnailUrl: region.thumbnailUrl || 'http://localhost:5001/uploads/regions/loire-valley-new-BsV_99z6.jpg',
                }));

            this.logger.log(`Filtered ${filteredRegions.length} relevant regions out of ${regionsData.length} total`);

            // Clear existing data
            await this.regionModel.deleteMany({});
            this.logger.log('Cleared existing regions data');

            // Insert new data
            const result = await this.regionModel.insertMany(filteredRegions);

            this.logger.log(`Successfully loaded ${result.length} regions`);

            return {
                success: true,
                message: `Successfully loaded ${result.length} regions`,
                count: result.length,
            };
        } catch (error) {
            this.logger.error('Error loading regions:', error);
            throw error;
        }
    }

    async getAllRegions(
        page: number = 1,
        limit: number = 10,
    ): Promise<{
        data: Region[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.regionModel.find().skip(skip).limit(limit).exec(),
            this.regionModel.countDocuments().exec(),
        ]);

        return {
            data,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async getRegionByName(denom: string): Promise<Region | null> {
        return this.regionModel.findOne({ denom }).exec();
    }

    async searchRegions(query: string): Promise<Region[]> {
        return this.regionModel
            .find({
                denom: { $regex: query, $options: 'i' },
            })
            .limit(50)
            .exec();
    }
}
