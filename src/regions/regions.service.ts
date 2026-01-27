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

    async loadRegionsFromJson(): Promise<{ success: boolean; message: string; count: number; parentCount: number; childCount: number }> {
        try {
            // Paths to the JSON files
            const reg2FilePath = path.join(process.cwd(), '..', 'docs', 'reg2.json');
            const reg3FilePath = path.join(process.cwd(), '..', 'docs', 'reg3.json');

            this.logger.log(`Reading parent regions from: ${reg2FilePath}`);
            this.logger.log(`Reading child regions from: ${reg3FilePath}`);

            // Check if files exist
            if (!fs.existsSync(reg2FilePath)) {
                throw new Error(`File not found: ${reg2FilePath}`);
            }
            if (!fs.existsSync(reg3FilePath)) {
                throw new Error(`File not found: ${reg3FilePath}`);
            }

            // Read the reg2.json file (parent regions)
            const reg2Content = fs.readFileSync(reg2FilePath, 'utf-8');
            const reg2Data = JSON.parse(reg2Content);

            // Debug: Log first item to see structure
            this.logger.log(`First reg2 item: ${JSON.stringify(reg2Data[0])}`);

            // Process reg2 data - now with proper field names
            const parentRegions = reg2Data
                .filter((region: any) => {
                    // Filter out entries with invalid coordinates
                    const isValid = region.denom && 
                                   typeof region.min_lat === 'number' && 
                                   typeof region.min_lon === 'number' && 
                                   typeof region.max_lat === 'number' && 
                                   typeof region.max_lon === 'number';
                    if (!isValid) {
                        this.logger.warn(`Skipping invalid reg2 entry: ${JSON.stringify(region)}`);
                    }
                    return isValid;
                })
                .map((region: any) => ({
                    denom: region.denom,
                    min_lat: region.min_lat,
                    min_lon: region.min_lon,
                    max_lat: region.max_lat,
                    max_lon: region.max_lon,
                    thumbnailUrl: 'http://localhost:5001/uploads/regions/loire-valley-new-BsV_99z6.jpg',
                    isParent: true,
                    parent: null,
                }));

            this.logger.log(`Processed ${parentRegions.length} parent regions from reg2.json`);
            this.logger.log(`First parent region: ${JSON.stringify(parentRegions[0])}`);

            // Read the reg3.json file (child regions)
            const reg3Content = fs.readFileSync(reg3FilePath, 'utf-8');
            const reg3Data = JSON.parse(reg3Content);

            // Debug: Log first item to see structure
            this.logger.log(`First reg3 item: ${JSON.stringify(reg3Data[0])}`);

            // Process reg3 data - child regions with parent references
            const childRegions = reg3Data
                .filter((region: any) => {
                    // Filter out entries with invalid coordinates
                    const isValid = region.denom && 
                                   typeof region.min_lat === 'number' && 
                                   typeof region.min_lon === 'number' && 
                                   typeof region.max_lat === 'number' && 
                                   typeof region.max_lon === 'number';
                    if (!isValid) {
                        this.logger.warn(`Skipping invalid reg3 entry: ${JSON.stringify(region)}`);
                    }
                    return isValid;
                })
                .map((region: any) => ({
                    denom: region.denom,
                    min_lat: region.min_lat,
                    min_lon: region.min_lon,
                    max_lat: region.max_lat,
                    max_lon: region.max_lon,
                    thumbnailUrl: region.Image || 'http://localhost:5001/uploads/regions/loire-valley-new-BsV_99z6.jpg',
                    isParent: region.Parent === 'Parent',
                    parent: region.Parent === 'Parent' ? null : region.Parent,
                }));

            this.logger.log(`Processed ${childRegions.length} child regions from reg3.json`);

            // Clear existing data
            await this.regionModel.deleteMany({});
            this.logger.log('Cleared existing regions data');

            // Combine and insert all regions
            const allRegions = [...parentRegions, ...childRegions];
            const result = await this.regionModel.insertMany(allRegions);

            const parentCount = result.filter(r => r.isParent).length;
            const childCount = result.filter(r => !r.isParent).length;

            this.logger.log(`Successfully loaded ${result.length} regions (${parentCount} parents, ${childCount} children)`);

            return {
                success: true,
                message: `Successfully loaded ${result.length} regions (${parentCount} parents, ${childCount} children)`,
                count: result.length,
                parentCount,
                childCount,
            };
        } catch (error) {
            this.logger.error('Error loading regions:', error);
            throw error;
        }
    }

    async getAllRegions(
        page: number = 1,
        limit: number = 10,
        isParent?: boolean,
    ): Promise<{
        data: Region[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        const skip = (page - 1) * limit;

        // Build query filter
        const filter = isParent !== undefined ? { isParent } : {};

        const [data, total] = await Promise.all([
            this.regionModel.find(filter).skip(skip).limit(limit).exec(),
            this.regionModel.countDocuments(filter).exec(),
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
