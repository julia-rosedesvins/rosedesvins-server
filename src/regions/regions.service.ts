import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Region } from '../schemas/region.schema';
import { User } from '../schemas/user.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { StaticExperience } from '../schemas/static-experience.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RegionsService {
    private readonly logger = new Logger(RegionsService.name);

    constructor(
        @InjectModel(Region.name) private regionModel: Model<Region>,
        @InjectModel(User.name) private userModel: Model<User>,
        @InjectModel(DomainProfile.name) private domainProfileModel: Model<DomainProfile>,
        @InjectModel(StaticExperience.name) private staticExperienceModel: Model<StaticExperience>,
        private configService: ConfigService,
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

    async getRegionByName(
        denom: string,
        page: number = 1,
        limit: number = 20,
    ): Promise<{
        region: Region | null;
        domains: Array<{
            domainName: string;
            domainDescription: string;
            domainProfilePictureUrl: string | null;
            producer: 'client' | 'non-client';
            domainPrice: number | null;
            siteUrl: string | null;
            location: string | null;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        // Step 1: Find region by name
        const region = await this.regionModel.findOne({ denom }).exec();
        
        if (!region) {
            return { region: null, domains: [], total: 0, page, limit, totalPages: 0 };
        }

        this.logger.log(`Found region: ${region.denom} with bounds [${region.min_lat}, ${region.min_lon}] to [${region.max_lat}, ${region.max_lon}]`);

        // Step 2: Find users whose coordinates fall within region bounds
        const usersInRegion = await this.userModel.find({
            $and: [
                { domainLatitude: { $gte: region.min_lat, $lte: region.max_lat, $ne: null } },
                { domainLongitude: { $gte: region.min_lon, $lte: region.max_lon, $ne: null } },
            ]
        }).select('_id domainName siteWeb city').exec();

        this.logger.log(`Found ${usersInRegion.length} users in region bounds`);

        const userIds = usersInRegion.map(user => user._id);

        // Step 3: Count total domain profiles and static experiences for pagination
        const regionBoundsQuery = {
            $and: [
                { latitude: { $gte: region.min_lat, $lte: region.max_lat, $ne: null } },
                { longitude: { $gte: region.min_lon, $lte: region.max_lon, $ne: null } },
            ]
        };

        const [totalDomainProfiles, totalStaticExperiences] = await Promise.all([
            this.domainProfileModel.countDocuments({ userId: { $in: userIds } }).exec(),
            this.staticExperienceModel.countDocuments(regionBoundsQuery).exec(),
        ]);

        const totalDomains = totalDomainProfiles + totalStaticExperiences;
        const totalPages = Math.ceil(totalDomains / limit);
        const skip = (page - 1) * limit;

        this.logger.log(`Total domains: ${totalDomains} (${totalDomainProfiles} profiles, ${totalStaticExperiences} experiences)`);

        // Step 4: Determine how to split the limit between profiles and experiences
        // Fetch domain profiles first, then fill remainder with static experiences
        let domainProfiles: any[] = [];
        let staticExperiences: any[] = [];
        let remainingLimit = limit;

        if (skip < totalDomainProfiles) {
            // Still fetching from domain profiles
            const profilesLimit = Math.min(remainingLimit, totalDomainProfiles - skip);
            domainProfiles = await this.domainProfileModel.find({
                userId: { $in: userIds },
            })
            .populate('userId', 'domainName siteWeb city')
            .skip(skip)
            .limit(profilesLimit)
            .exec();

            remainingLimit -= domainProfiles.length;

            // If we still have space in the page, fetch static experiences
            if (remainingLimit > 0) {
                staticExperiences = await this.staticExperienceModel.find(regionBoundsQuery)
                    .limit(remainingLimit)
                    .exec();
            }
        } else {
            // Skip past all domain profiles, fetch only static experiences
            const experiencesSkip = skip - totalDomainProfiles;
            staticExperiences = await this.staticExperienceModel.find(regionBoundsQuery)
                .skip(experiencesSkip)
                .limit(limit)
                .exec();
        }

        this.logger.log(`Fetched ${domainProfiles.length} domain profiles and ${staticExperiences.length} static experiences for page ${page}`);

        // Step 5: Format domain profiles data
        const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:5001';
        const domainsFromProfiles = domainProfiles.map(profile => {
            const user = profile.userId as any;
            const firstActiveService = profile.services.find(s => s.isActive);
            
            return {
                domainName: user?.domainName || 'Unknown Domain',
                domainDescription: profile.domainDescription,
                domainProfilePictureUrl: profile.domainProfilePictureUrl 
                    ? `${backendUrl}/${profile.domainProfilePictureUrl}` 
                    : null,
                producer: 'client' as const,
                domainPrice: firstActiveService?.pricePerPerson || null,
                siteUrl: null,
                location: user?.city || null,
            };
        });

        // Step 6: Format static experiences data
        const domainsFromExperiences = staticExperiences.map(exp => ({
            domainName: exp.name,
            domainDescription: exp.about || exp.category || '',
            domainProfilePictureUrl: exp.main_image || null,
            producer: 'non-client' as const,
            domainPrice: null,
            siteUrl: exp.website || null,
            location: exp.city || null,
        }));

        // Step 7: Combine both arrays
        const domains = [...domainsFromProfiles, ...domainsFromExperiences];

        this.logger.log(`Returning page ${page} with ${domains.length} domains (total: ${totalDomains})`);

        return {
            region,
            domains,
            total: totalDomains,
            page,
            limit,
            totalPages,
        };
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
