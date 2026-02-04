import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Region } from '../schemas/region.schema';
import { User } from '../schemas/user.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { StaticExperience } from '../schemas/static-experience.schema';
import { Availability } from '../schemas/availability.schema';
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
        @InjectModel(Availability.name) private availabilityModel: Model<Availability>,
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
        searchQuery?: string,
        filters?: {
            days?: string[];
            minPrice?: number;
            maxPrice?: number;
            languages?: string[];
        },
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
            latitude: number | null;
            longitude: number | null;
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
        }).select('_id domainName siteWeb city domainLatitude domainLongitude').exec();

        this.logger.log(`Found ${usersInRegion.length} users in region bounds`);

        const userIds = usersInRegion.map(user => user._id);

        // Step 3: Build search query if provided
        let domainProfileQuery: any = { userId: { $in: userIds } };
        let staticExperienceQuery: any = {};

        if (searchQuery) {
            const searchRegex = { $regex: searchQuery, $options: 'i' };
            
            // Add search conditions for domain profiles
            domainProfileQuery.$or = [
                { domainName: searchRegex },
                { domainDescription: searchRegex },
                { 'services.serviceName': searchRegex },
                { 'services.serviceDescription': searchRegex },
            ];

            // When search query is present, search ALL static experiences globally
            // Don't restrict by region bounds so we can show matching results
            staticExperienceQuery = {
                $or: [
                    { name: searchRegex },
                    { category: searchRegex },
                    { address: searchRegex },
                    { city: searchRegex },
                    { about: searchRegex },
                ]
            };
        } else {
            // Without search query, only show static experiences within region bounds
            staticExperienceQuery = {
                $and: [
                    { latitude: { $gte: region.min_lat, $lte: region.max_lat, $ne: null } },
                    { longitude: { $gte: region.min_lon, $lte: region.max_lon, $ne: null } },
                ]
            };
        }

        // Step 4: Count total domain profiles and static experiences for pagination
        const regionBoundsQuery = staticExperienceQuery;

        const [totalDomainProfiles, totalStaticExperiences] = await Promise.all([
            this.domainProfileModel.countDocuments(domainProfileQuery).exec(),
            this.staticExperienceModel.countDocuments(regionBoundsQuery).exec(),
        ]);

        const totalDomains = totalDomainProfiles + totalStaticExperiences;
        const totalPages = Math.ceil(totalDomains / limit);
        const skip = (page - 1) * limit;

        this.logger.log(`Total domains: ${totalDomains} (${totalDomainProfiles} profiles, ${totalStaticExperiences} experiences)`);

        // Step 5: Determine how to split the limit between profiles and experiences
        // Fetch domain profiles first, then fill remainder with static experiences
        let domainProfiles: any[] = [];
        let staticExperiences: any[] = [];
        let remainingLimit = limit;

        if (skip < totalDomainProfiles) {
            // Still fetching from domain profiles
            const profilesLimit = Math.min(remainingLimit, totalDomainProfiles - skip);
            domainProfiles = await this.domainProfileModel.find(domainProfileQuery)
            .populate('userId', 'domainName siteWeb city domainLatitude domainLongitude')
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
                    ? `${backendUrl}${profile.domainProfilePictureUrl}` 
                    : null,
                producer: 'client' as const,
                domainPrice: firstActiveService?.pricePerPerson || null,
                siteUrl: null,
                location: user?.city || null,
                domainId: profile._id.toString(),
                latitude: user?.domainLatitude || null,
                longitude: user?.domainLongitude || null,
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
            domainId: null,
            latitude: exp.latitude || null,
            longitude: exp.longitude || null,
        }));

        // Step 7: Combine both arrays
        const domains = [...domainsFromProfiles, ...domainsFromExperiences];

        // Step 8: Apply filters if provided
        let filteredDomains = domains;
        if (filters && Object.keys(filters).length > 0) {
            filteredDomains = await this.filterDomains(domains, domainProfiles, filters);
        }

        this.logger.log(`Returning page ${page} with ${filteredDomains.length} domains (total: ${totalDomains})`);

        return {
            region,
            domains: filteredDomains,
            total: totalDomains,
            page,
            limit,
            totalPages,
        };
    }

    /**
     * Helper method to filter domains based on filter criteria
     */
    private async filterDomains(
        domains: any[],
        domainProfiles: any[],
        filters: {
            days?: string[];
            minPrice?: number;
            maxPrice?: number;
            languages?: string[];
        }
    ): Promise<any[]> {
        const dayMapping = {
            'Lundi': 'monday',
            'Mardi': 'tuesday',
            'Mercredi': 'wednesday',
            'Jeudi': 'thursday',
            'Vendredi': 'friday',
            'Samedi': 'saturday',
            'Dimanche': 'sunday'
        };

        // Filter only client domains (those with profiles)
        const filteredResults: any[] = [];

        for (const domain of domains) {
            // Skip non-client domains if we have filters
            if (domain.producer !== 'client') {
                continue;
            }

            // Find the corresponding domain profile
            const profile = domainProfiles.find(p => p._id.toString() === domain.domainId);
            if (!profile || !profile.services || profile.services.length === 0) {
                continue;
            }

            // Check if any service matches all filters
            let hasMatchingService = false;

            for (const service of profile.services) {
                if (!service.isActive) continue;

                let matchesFilters = true;

                // Filter by price
                if (filters.maxPrice !== undefined && filters.maxPrice > 0) {
                    if (service.pricePerPerson > filters.maxPrice) {
                        matchesFilters = false;
                    }
                }
                if (filters.minPrice !== undefined) {
                    if (service.pricePerPerson < filters.minPrice) {
                        matchesFilters = false;
                    }
                }

                // Filter by languages
                if (filters.languages && filters.languages.length > 0) {
                    const hasMatchingLanguage = filters.languages.some(lang => 
                        service.languagesOffered.includes(lang)
                    );
                    if (!hasMatchingLanguage) {
                        matchesFilters = false;
                    }
                }

                // Filter by availability days
                if (filters.days && filters.days.length > 0 && matchesFilters) {
                    const isAvailableOnDays = await this.checkServiceAvailabilityForDays(
                        profile.userId._id,
                        service,
                        filters.days,
                        dayMapping
                    );
                    if (!isAvailableOnDays) {
                        matchesFilters = false;
                    }
                }

                if (matchesFilters) {
                    hasMatchingService = true;
                    break;
                }
            }

            if (hasMatchingService) {
                filteredResults.push(domain);
            }
        }

        return filteredResults;
    }

    /**
     * Check if a service is available on the specified days
     */
    private async checkServiceAvailabilityForDays(
        userId: any,
        service: any,
        days: string[],
        dayMapping: Record<string, string>
    ): Promise<boolean> {
        // If service has custom availability, check dateAvailability array
        if (service.hasCustomAvailability && service.dateAvailability && service.dateAvailability.length > 0) {
            // Check if any date in dateAvailability matches the requested days
            const now = new Date();
            for (const dateAvail of service.dateAvailability) {
                const date = new Date(dateAvail.date);
                // Only check future dates
                if (date < now) continue;

                const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
                const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
                const frenchDay = dayNames[dayOfWeek];

                if (days.includes(frenchDay) && dateAvail.enabled) {
                    // Check if there are time slots available
                    if (dateAvail.morningEnabled || dateAvail.afternoonEnabled) {
                        return true;
                    }
                }
            }
            return false;
        }

        // Otherwise, check the availability schema
        const availability = await this.availabilityModel.findOne({ userId }).exec();
        if (!availability || !availability.weeklyAvailability) {
            // If no availability set, assume available all days
            return true;
        }

        // Check if available on any of the requested days
        for (const frenchDay of days) {
            const englishDay = dayMapping[frenchDay];
            if (englishDay && availability.weeklyAvailability[englishDay]) {
                const dayAvail = availability.weeklyAvailability[englishDay];
                if (dayAvail.isAvailable && dayAvail.timeSlots && dayAvail.timeSlots.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    async searchRegions(query: string): Promise<Region[]> {
        return this.regionModel
            .find({
                denom: { $regex: query, $options: 'i' },
            })
            .limit(50)
            .exec();
    }

    async unifiedSearch(query: string): Promise<{
        success: boolean;
        data: {
            type: 'service' | 'domain' | 'region' | 'static-experience' | 'mixed' | null;
            services?: any[];
            domains?: any[];
            regions?: any[];
            staticExperiences?: any[];
            suggestedRoute?: string;
        };
    }> {
        const backendUrl = this.configService.get<string>('BACKEND_URL') || '';
        const searchQuery = query.trim();
        const isNumeric = !isNaN(parseFloat(searchQuery));
        const numericQuery = isNumeric ? parseFloat(searchQuery) : null;

        // Search in services (via domain profiles) - enhanced search
        const serviceSearchConditions: any = {
            'services.isActive': true,
            $or: [
                { 'services.name': { $regex: searchQuery, $options: 'i' } },
                { 'services.description': { $regex: searchQuery, $options: 'i' } },
                { 'services.languagesOffered': { $in: [new RegExp(searchQuery, 'i')] } }
            ]
        };

        // Add price search if query is numeric
        if (numericQuery !== null) {
            serviceSearchConditions.$or.push({
                'services.pricePerPerson': { $gte: numericQuery - 10, $lte: numericQuery + 10 }
            });
        }

        const domainProfilesWithServices = await this.domainProfileModel
            .find(serviceSearchConditions)
            .populate('userId', 'domainName domainLatitude domainLongitude address city codePostal region')
            .limit(30)
            .exec();

        const services: any[] = [];
        for (const profile of domainProfilesWithServices) {
            const user = profile.userId as any;
            const profileDoc = profile.toObject();
            
            for (const service of profileDoc.services as any[]) {
                if (!service.isActive) continue;

                const matchesName = service.name.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesDescription = service.description?.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesLanguage = service.languagesOffered?.some((lang: string) => 
                    lang.toLowerCase().includes(searchQuery.toLowerCase())
                );
                const matchesPrice = numericQuery !== null && 
                    Math.abs(service.pricePerPerson - numericQuery) <= 10;

                if (matchesName || matchesDescription || matchesLanguage || matchesPrice) {
                    services.push({
                        serviceId: service._id,
                        serviceName: service.name,
                        serviceDescription: service.description,
                        pricePerPerson: service.pricePerPerson,
                        languagesOffered: service.languagesOffered,
                        serviceBannerUrl: service.serviceBannerUrl ? `${backendUrl}${service.serviceBannerUrl}` : null,
                        domain: {
                            domainId: profile._id,
                            userId: user?._id || null,
                            domainName: user?.domainName || null,
                            domainDescription: profileDoc.domainDescription,
                            colorCode: profileDoc.colorCode,
                        }
                    });
                }
            }
        }

        // Search in static experiences
        const staticExperiences = await this.staticExperienceModel
            .find({
                $or: [
                    { name: { $regex: searchQuery, $options: 'i' } },
                    { category: { $regex: searchQuery, $options: 'i' } },
                    { address: { $regex: searchQuery, $options: 'i' } },
                    { city: { $regex: searchQuery, $options: 'i' } },
                    { about: { $regex: searchQuery, $options: 'i' } }
                ]
            })
            .limit(20)
            .exec();

        const staticExperienceResults = staticExperiences.map(exp => ({
            name: exp.name,
            category: exp.category,
            address: exp.address,
            city: exp.city,
            latitude: exp.latitude,
            longitude: exp.longitude,
            rating: exp.rating,
            website: exp.website,
            mainImage: exp.main_image,
            about: exp.about,
            type: 'static-experience' as const
        }));

        // Search in domains (user's domain names)
        const usersWithDomains = await this.userModel
            .find({
                domainName: { $regex: searchQuery, $options: 'i' }
            })
            .limit(20)
            .exec();

        const domainIds = usersWithDomains.map(user => user._id);
        const domainProfiles = await this.domainProfileModel
            .find({ userId: { $in: domainIds } })
            .populate('userId', 'domainName domainLatitude domainLongitude address city codePostal region')
            .exec();

        const domains = domainProfiles.map(profile => {
            const user = profile.userId as any;
            return {
                domainId: profile._id,
                userId: user?._id || null,
                domainName: user?.domainName || null,
                domainDescription: profile.domainDescription,
                colorCode: profile.colorCode,
                domainProfilePictureUrl: profile.domainProfilePictureUrl ? `${backendUrl}${profile.domainProfilePictureUrl}` : null,
                domainLogoUrl: profile.domainLogoUrl ? `${backendUrl}${profile.domainLogoUrl}` : null,
                location: {
                    latitude: user?.domainLatitude || null,
                    longitude: user?.domainLongitude || null,
                    address: user?.address || null,
                    city: user?.city || null,
                    region: user?.region || null,
                }
            };
        });

        // Search in regions
        const regions = await this.regionModel
            .find({
                denom: { $regex: searchQuery, $options: 'i' },
            })
            .limit(20)
            .exec();

        const regionResults = regions.map(region => ({
            denom: region.denom,
            min_lat: region.min_lat,
            min_lon: region.min_lon,
            max_lat: region.max_lat,
            max_lon: region.max_lon,
            thumbnailUrl: region.thumbnailUrl ? `${backendUrl}${region.thumbnailUrl}` : null,
            isParent: region.isParent,
        }));

        // Determine search type and suggested route
        let type: 'service' | 'domain' | 'region' | 'static-experience' | 'mixed' | null = null;
        let suggestedRoute = '';

        const hasServices = services.length > 0;
        const hasDomains = domains.length > 0;
        const hasRegions = regionResults.length > 0;
        const hasStaticExperiences = staticExperienceResults.length > 0;
        const totalResults = [hasServices, hasDomains, hasRegions, hasStaticExperiences].filter(Boolean).length;

        if (totalResults === 0) {
            type = null;
        } else if (totalResults === 1) {
            if (hasServices) {
                type = 'service';
                suggestedRoute = `/experiences?q=${encodeURIComponent(searchQuery)}`;
            } else if (hasDomains) {
                type = 'domain';
                if (domains.length === 1 && domains[0].location.region) {
                    suggestedRoute = `/region/${encodeURIComponent(domains[0].location.region)}?q=${encodeURIComponent(searchQuery)}`;
                } else {
                    suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                }
            } else if (hasRegions) {
                type = 'region';
                if (regionResults.length === 1) {
                    suggestedRoute = `/region/${encodeURIComponent(regionResults[0].denom)}?q=${encodeURIComponent(searchQuery)}`;
                } else {
                    suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                }
            } else if (hasStaticExperiences) {
                type = 'static-experience';
                // Try to find region by coordinates first, then by city name
                let matchedRegion: any = null;
                
                // Get coordinates from static experiences
                const experiencesWithCoords = staticExperienceResults.filter(exp => exp.latitude && exp.longitude);
                
                if (experiencesWithCoords.length > 0) {
                    // Use the first experience with coordinates to find the region
                    const exp = experiencesWithCoords[0];
                    
                    // Find region that contains these coordinates
                    matchedRegion = await this.regionModel.findOne({
                        min_lat: { $lte: exp.latitude },
                        max_lat: { $gte: exp.latitude },
                        min_lon: { $lte: exp.longitude },
                        max_lon: { $gte: exp.longitude }
                    }).exec();
                }
                
                // If no region found by coordinates, try by city name
                if (!matchedRegion) {
                    const cities = staticExperienceResults.map(exp => exp.city).filter(Boolean);
                    const uniqueCities = [...new Set(cities)];
                    
                    if (uniqueCities.length === 1 && uniqueCities[0]) {
                        matchedRegion = await this.regionModel.findOne({
                            denom: { $regex: uniqueCities[0], $options: 'i' }
                        }).exec();
                    }
                }
                
                if (matchedRegion) {
                    suggestedRoute = `/region/${encodeURIComponent(matchedRegion.denom)}?q=${encodeURIComponent(searchQuery)}`;
                } else {
                    // If still no region found, try to find the nearest parent region
                    if (experiencesWithCoords.length > 0) {
                        const exp = experiencesWithCoords[0];
                        const nearestRegion = await this.regionModel.findOne({
                            isParent: true
                        }).sort({
                            // Simple distance calculation - find closest region center
                        }).limit(1).exec();
                        
                        if (nearestRegion) {
                            suggestedRoute = `/region/${encodeURIComponent(nearestRegion.denom)}?q=${encodeURIComponent(searchQuery)}`;
                        } else {
                            suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                        }
                    } else {
                        suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                    }
                }
            }
        } else {
            type = 'mixed';
            // Priority: domain > region > service/static-experience
            if (hasDomains) {
                if (domains.length === 1 && domains[0].location.region) {
                    suggestedRoute = `/region/${encodeURIComponent(domains[0].location.region)}?q=${encodeURIComponent(searchQuery)}`;
                } else {
                    suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                }
            } else if (hasRegions) {
                if (regionResults.length === 1) {
                    suggestedRoute = `/region/${encodeURIComponent(regionResults[0].denom)}?q=${encodeURIComponent(searchQuery)}`;
                } else {
                    suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                }
            } else if (hasStaticExperiences) {
                // Try to find region by coordinates for static experiences
                const experiencesWithCoords = staticExperienceResults.filter(exp => exp.latitude && exp.longitude);
                
                if (experiencesWithCoords.length > 0) {
                    const exp = experiencesWithCoords[0];
                    const matchedRegion = await this.regionModel.findOne({
                        min_lat: { $lte: exp.latitude },
                        max_lat: { $gte: exp.latitude },
                        min_lon: { $lte: exp.longitude },
                        max_lon: { $gte: exp.longitude }
                    }).exec();
                    
                    if (matchedRegion) {
                        suggestedRoute = `/region/${encodeURIComponent(matchedRegion.denom)}?q=${encodeURIComponent(searchQuery)}`;
                    } else {
                        suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                    }
                } else {
                    suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
                }
            } else {
                // Services only
                suggestedRoute = `/regions?q=${encodeURIComponent(searchQuery)}`;
            }
        }

        return {
            success: true,
            data: {
                type,
                services: services.length > 0 ? services : undefined,
                domains: domains.length > 0 ? domains : undefined,
                regions: regionResults.length > 0 ? regionResults : undefined,
                staticExperiences: staticExperienceResults.length > 0 ? staticExperienceResults : undefined,
                suggestedRoute
            }
        };
    }
}