import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Region } from '../schemas/region.schema';
import { User } from '../schemas/user.schema';
import { DomainProfile } from '../schemas/domain-profile.schema';
import { StaticExperience } from '../schemas/static-experience.schema';
import { Availability } from '../schemas/availability.schema';
import { S3Service } from '../common/services/s3.service';
import { CitiesService } from '../cities/cities.service';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';
import { slugify, ensureUniqueSlug } from '../common/utils/slug.util';
import { buildFullMediaUrl } from '../common/utils/media-url.util';
import { regionDenomMatchesShortName, resolveRegionSlugAlias } from '../common/utils/region-slug.util';
import { compareSearchMatch, scoreSearchMatch } from '../common/utils/search-relevance.util';
import * as fs from 'fs';
import * as path from 'path';
import * as sharp from 'sharp';
import axios from 'axios';

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
        private s3Service: S3Service,
        private citiesService: CitiesService,
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

            // Combine and insert all regions, computing a unique slug for each
            const allRegions = [...parentRegions, ...childRegions];
            const usedSlugs = new Set<string>();
            const allRegionsWithSlugs = allRegions.map((region) => {
                const baseSlug = slugify(region.denom) || 'region';
                let slug = baseSlug;
                let suffix = 2;
                while (usedSlugs.has(slug)) {
                    slug = `${baseSlug}-${suffix}`;
                    suffix += 1;
                }
                usedSlugs.add(slug);
                return { ...region, slug };
            });
            const result = await this.regionModel.insertMany(allRegionsWithSlugs);

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
            date?: string;
            days?: string[];
            minPrice?: number;
            maxPrice?: number;
            languages?: string[];
            categories?: string[];
        },
        coords?: { lat: number; lon: number },
    ): Promise<{
        region: Region | null;
        domains: Array<{
            domainName: string;
            domainDescription: string;
            domainProfilePictureUrl: string | null;
            domainLogoUrl: string | null;
            producer: 'client' | 'non-client';
            domainPrice: number | null;
            siteUrl: string | null;
            location: string | null;
            category: string | null;
            categoryId: string | null;
            latitude: number | null;
            longitude: number | null;
        }>;
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }> {
        // Step 1: Find region by slug (canonical + short aliases), then raw denom (legacy links)
        const slugCandidate = resolveRegionSlugAlias(denom);
        let region: Region | null = await this.regionModel.findOne({ slug: slugCandidate }).exec();
        if (!region && slugCandidate !== denom) {
            region = await this.regionModel.findOne({ slug: denom }).exec();
        }
        if (!region) {
            region = await this.regionModel.findOne({ denom }).exec();
        }
        if (!region) {
            region = await this.findParentRegionByShortName(denom);
        }

        if (!region) {
            // Resolve coordinates: prefer explicit coords param, then look up denom as a city name
            let resolvedCoords = coords;

            if (!resolvedCoords) {
                // Try to find a city whose name matches the denom (best-effort: slugs use hyphens
                // in place of spaces, so convert them back before searching the city gazetteer)
                const citySearchTerm = denom.includes('-') ? denom.replace(/-/g, ' ') : denom;
                const cityResult = await this.citiesService.searchCities(citySearchTerm);
                const cityData = (cityResult?.data?.[0]) ?? (Array.isArray(cityResult) ? cityResult[0] : null) ?? null;
                if (cityData?.latitude_centre != null && cityData?.longitude_centre != null) {
                    resolvedCoords = { lat: cityData.latitude_centre, lon: cityData.longitude_centre };
                    this.logger.log(`Region "${denom}" not found – resolved city "${cityData.nom_standard}" at (${resolvedCoords.lat}, ${resolvedCoords.lon})`);
                }
            }

            if (resolvedCoords) {
                region = await this.getRegionByCoords(resolvedCoords.lat, resolvedCoords.lon);
                if (region) {
                    this.logger.log(`Falling back to closest region "${region.denom}" for "${denom}"`);
                }
            }
        }

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
            .populate('services.category', 'category_name')
            .skip(skip)
            .limit(profilesLimit)
            .exec();

            remainingLimit -= domainProfiles.length;

            // If we still have space in the page, fetch static experiences
            if (remainingLimit > 0) {
                staticExperiences = await this.staticExperienceModel.find(regionBoundsQuery)
                    .populate('category_ref', 'category_name')
                    .limit(remainingLimit)
                    .exec();
            }
        } else {
            // Skip past all domain profiles, fetch only static experiences
            const experiencesSkip = skip - totalDomainProfiles;
            staticExperiences = await this.staticExperienceModel.find(regionBoundsQuery)
                .populate('category_ref', 'category_name')
                .skip(experiencesSkip)
                .limit(limit)
                .exec();
        }

        this.logger.log(`Fetched ${domainProfiles.length} domain profiles and ${staticExperiences.length} static experiences for page ${page}`);

        // Step 5: Format domain profiles data
        const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:5001';
        const domainsFromProfiles = domainProfiles.map(profile => {
            const user = profile.userId as any;
            const { domainPrice, categoryName, categoryId } = this.getClientDomainListingMeta(
                profile.services as any[],
            );

            return {
                domainName: user?.domainName || 'Unknown Domain',
                domainDescription: profile.domainDescription,
                domainProfilePictureUrl: buildFullMediaUrl(profile.domainProfilePictureUrl, backendUrl),
                domainLogoUrl: buildFullMediaUrl(profile.domainLogoUrl, backendUrl),
                producer: 'client' as const,
                domainPrice,
                siteUrl: null,
                location: user?.city || null,
                category: categoryName,
                categoryId: categoryId,
                domainId: profile._id.toString(),
                slug: (profile as any).slug || null,
                latitude: user?.domainLatitude || null,
                longitude: user?.domainLongitude || null,
            };
        });

        // Step 6: Format static experiences data
        const domainsFromExperiences = staticExperiences.map(exp => {
            // If category_ref is populated, use its category_name and ID, otherwise use the category string field
            let categoryName: string | null = null;
            let categoryRefId: string | null = null;
            
            if (exp.category_ref) {
                const categoryRefObj = exp.category_ref as any;
                categoryName = categoryRefObj.category_name || null;
                categoryRefId = categoryRefObj._id?.toString() || exp.category_ref.toString();
            }
            if (!categoryName) {
                categoryName = exp.category || null;
            }
            
            return {
                domainName: exp.domain_name || exp.name,
                domainDescription: exp.domain_description || exp.about || exp.category || '',
                domainProfilePictureUrl: exp.domain_profile_pic_url || exp.main_image || null,
                domainLogoUrl: exp.domain_logo_url || null,
                mainImage: exp.main_image || null,
                producer: 'non-client' as const,
                domainPrice: null,
                siteUrl: exp.website || null,
                location: exp.city || null,
                category: categoryName,
                categoryId: categoryRefId,
                domainId: exp._id.toString(),
                slug: (exp as any).slug || null,
                latitude: exp.latitude || null,
                longitude: exp.longitude || null,
            };
        });

        // Step 7: Combine both arrays
        const domains = [...domainsFromProfiles, ...domainsFromExperiences];

        // Step 8: Apply filters if provided
        let filteredDomains = domains;
        if (filters && Object.keys(filters).length > 0) {
            filteredDomains = await this.filterDomains(domains, domainProfiles, staticExperiences, filters);
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
     * Client domains list one row per domain, not per service. Show the lowest
     * bookable price ("à partir de") across active services — same services as
     * the public experience page. Treat missing isActive as active (schema default).
     */
    private getClientDomainListingMeta(services: any[] | undefined): {
        domainPrice: number | null;
        categoryName: string | null;
        categoryId: string | null;
    } {
        if (!services?.length) {
            return { domainPrice: null, categoryName: null, categoryId: null };
        }

        const activeServices = services.filter((s) => s?.isActive !== false);
        if (!activeServices.length) {
            return { domainPrice: null, categoryName: null, categoryId: null };
        }

        const priced = activeServices.filter(
            (s) => s.pricePerPerson != null && !Number.isNaN(Number(s.pricePerPerson)),
        );

        const domainPrice = priced.length
            ? Math.min(...priced.map((s) => Number(s.pricePerPerson)))
            : null;

        const categorySource =
            [...priced].sort((a, b) => Number(a.pricePerPerson) - Number(b.pricePerPerson))[0] ||
            activeServices.find((s) => s.category);

        let categoryName: string | null = null;
        let categoryId: string | null = null;
        if (categorySource?.category) {
            const categoryObj = categorySource.category as any;
            categoryName = categoryObj.category_name || null;
            categoryId = categoryObj._id?.toString() || categorySource.category.toString();
        }

        return { domainPrice, categoryName, categoryId };
    }

    /**
     * Helper method to filter domains based on filter criteria
     */
    private async filterDomains(
        domains: any[],
        domainProfiles: any[],
        staticExperiences: any[],
        filters: {
            date?: string;
            days?: string[];
            minPrice?: number;
            maxPrice?: number;
            languages?: string[];
            categories?: string[];
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

        const filteredResults: any[] = [];

        this.logger.log(`Filtering ${domains.length} domains with filters: ${JSON.stringify(filters)}`);

        for (const domain of domains) {
            // Handle client domains (those with profiles)
            if (domain.producer === 'client') {
                // Find the corresponding domain profile
                const profile = domainProfiles.find(p => p._id.toString() === domain.domainId);
                if (!profile || !profile.services || profile.services.length === 0) {
                    continue;
                }

                // Check if any service matches all filters
                let hasMatchingService = false;

                for (const service of profile.services) {
                    if (service.isActive === false) continue;

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

                    // Filter by categories - compare category IDs
                    if (filters.categories && filters.categories.length > 0 && matchesFilters) {
                        if (service.category) {
                            // Get the category ID (could be ObjectId or populated object)
                            const categoryId = typeof service.category === 'object' 
                                ? service.category._id?.toString() 
                                : service.category.toString();
                            if (!filters.categories.includes(categoryId)) {
                                matchesFilters = false;
                            }
                        } else {
                            // No category assigned, doesn't match filter
                            matchesFilters = false;
                        }
                    }

                    // Filter by specific date
                    if (filters.date && matchesFilters) {
                        const isAvailableOnDate = await this.checkServiceAvailabilityForDate(
                            profile.userId._id,
                            service,
                            filters.date
                        );
                        if (!isAvailableOnDate) {
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
            } else if (domain.producer === 'non-client') {
                // Handle non-client domains (static experiences)
                let matchesFilters = true;

                // Filter by categories - check if categoryId exists and matches
                if (filters.categories && filters.categories.length > 0) {
                    // If no categoryId (manual category), exclude from filtered results
                    if (!domain.categoryId) {
                        matchesFilters = false;
                    } else if (!filters.categories.includes(domain.categoryId)) {
                        matchesFilters = false;
                    }
                }

                // Filter by specific date - check opening_hours
                if (filters.date && matchesFilters) {
                    const staticExp = staticExperiences.find(exp => 
                        exp.name === domain.domainName && 
                        exp.latitude === domain.latitude && 
                        exp.longitude === domain.longitude
                    );
                    
                    if (staticExp) {
                        const isOpen = this.checkStaticExperienceOpenOnDate(staticExp, filters.date);
                        if (!isOpen) {
                            matchesFilters = false;
                        }
                    } else {
                        // If we can't find the experience, exclude it from filtered results
                        matchesFilters = false;
                    }
                }

                if (matchesFilters) {
                    filteredResults.push(domain);
                }
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

    /**
     * Check if a service is available on a specific date
     */
    private async checkServiceAvailabilityForDate(
        userId: any,
        service: any,
        dateString: string
    ): Promise<boolean> {
        const targetDate = new Date(dateString);
        targetDate.setHours(0, 0, 0, 0);
        const now = new Date();
        now.setHours(0, 0, 0, 0);

        this.logger.log(`Checking availability for service '${service.name}' on date ${targetDate.toISOString()}`);
        this.logger.log(`hasCustomAvailability: ${service.hasCustomAvailability}`);

        // Only check future dates or today
        if (targetDate < now) {
            this.logger.log(`Date is in the past, not available`);
            return false;
        }

        // If service has custom availability enabled, check dateAvailability array
        if (service.hasCustomAvailability === true) {
            this.logger.log(`Using custom availability, checking dateAvailability array (${service.dateAvailability?.length || 0} entries)`);
            
            if (!service.dateAvailability || service.dateAvailability.length === 0) {
                // Custom availability is enabled but no dates configured - not available
                this.logger.log(`No custom dates configured, not available`);
                return false;
            }

            for (const dateAvail of service.dateAvailability) {
                const availDate = new Date(dateAvail.date);
                availDate.setHours(0, 0, 0, 0);

                if (availDate.getTime() === targetDate.getTime() && dateAvail.enabled) {
                    // Check if there are time slots available
                    if (dateAvail.morningEnabled || dateAvail.afternoonEnabled) {
                        this.logger.log(`Found matching custom date with enabled slots`);
                        return true;
                    }
                }
            }
            this.logger.log(`No matching custom date found`);
            return false;
        }

        // If hasCustomAvailability is false, check the availability schema based on day of week
        this.logger.log(`Using weekly availability schema`);
        const availability = await this.availabilityModel.findOne({ userId }).exec();
        if (!availability || !availability.weeklyAvailability) {
            // If no availability set, assume available all days
            this.logger.log(`No availability schema found, assuming available`);
            return true;
        }

        // Map day of week to availability
        const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const englishDay = dayNames[dayOfWeek];

        this.logger.log(`Checking ${englishDay} in weekly availability`);

        if (availability.weeklyAvailability[englishDay]) {
            const dayAvail = availability.weeklyAvailability[englishDay];
            if (dayAvail.isAvailable && dayAvail.timeSlots && dayAvail.timeSlots.length > 0) {
                this.logger.log(`Service available on ${englishDay}`);
                return true;
            }
        }

        this.logger.log(`Service not available on ${englishDay}`);
        return false;
    }

    /**
     * Check if a static experience is open on a specific date based on opening_hours
     */
    private checkStaticExperienceOpenOnDate(
        staticExperience: any,
        dateString: string
    ): boolean {
        const targetDate = new Date(dateString);
        const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[dayOfWeek];

        // If no opening_hours data, assume it's open
        if (!staticExperience.opening_hours) {
            return true;
        }

        // Check if the day exists in opening_hours
        const hoursForDay = staticExperience.opening_hours.get?.(dayName) || staticExperience.opening_hours[dayName];
        
        if (!hoursForDay) {
            return false; // No hours defined for this day
        }

        // Check if it's marked as closed
        if (Array.isArray(hoursForDay) && hoursForDay.length === 1 && hoursForDay[0] === 'Closed') {
            return false;
        }

        // If there are any time slots, consider it open
        if (Array.isArray(hoursForDay) && hoursForDay.length > 0 && hoursForDay[0] !== 'Closed') {
            return true;
        }

        return false;
    }

    async searchRegions(query: string): Promise<Region[]> {
        const pattern = this.buildAccentInsensitivePattern(query);
        const plain = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regions = await this.regionModel
            .find({ $or: [
                { denom: { $regex: pattern, $options: 'i' } },
                { denom: { $regex: plain, $options: 'i' } },
            ]})
            .limit(50)
            .exec();

        return regions.sort((a, b) =>
            compareSearchMatch(query, a.denom, b.denom, a.slug, b.slug),
        );
    }

    /**
     * Resolve short region names (e.g. "corse") to a parent wine region record.
     */
    private async findParentRegionByShortName(name: string): Promise<Region | null> {
        const parentRegions = await this.regionModel.find({ isParent: true }).exec();
        const matches = parentRegions.filter((region) => regionDenomMatchesShortName(region.denom, name));
        if (matches.length === 0) return null;

        matches.sort((a, b) => a.denom.length - b.denom.length);
        return matches[0];
    }

    /**
     * Find the best-matching region for a given coordinate point.
     * 1. First tries to find a child region (isParent=false) whose bounding box contains the point.
     * 2. Falls back to a parent region (isParent=true) whose bounding box contains the point.
     * 3. If still nothing, returns the region with the smallest bounding-box centre distance.
     */
    async getRegionByCoords(lat: number, lon: number): Promise<Region | null> {
        // Try child regions first (more specific), then parent regions
        for (const parentFlag of [false, true]) {
            const containing = await this.regionModel.findOne({
                isParent: parentFlag,
                min_lat: { $lte: lat },
                max_lat: { $gte: lat },
                min_lon: { $lte: lon },
                max_lon: { $gte: lon },
            }).exec();

            if (containing) {
                this.logger.log(`getRegionByCoords(${lat}, ${lon}): found containing region "${containing.denom}" (isParent=${parentFlag})`);
                return containing;
            }
        }

        // Fallback: find region whose centre is closest to the point
        const allRegions = await this.regionModel.find().exec();
        if (!allRegions.length) return null;

        let closest: Region | null = null;
        let minDist = Infinity;

        for (const region of allRegions) {
            const centerLat = (region.min_lat + region.max_lat) / 2;
            const centerLon = (region.min_lon + region.max_lon) / 2;
            const dist = Math.sqrt(Math.pow(centerLat - lat, 2) + Math.pow(centerLon - lon, 2));
            if (dist < minDist) {
                minDist = dist;
                closest = region;
            }
        }

        if (closest) {
            this.logger.log(`getRegionByCoords(${lat}, ${lon}): no containing region, using closest "${(closest as any).denom}"`);
        }
        return closest;
    }

    /**
     * Builds an accent-insensitive, case-insensitive regex pattern for a SINGLE token.
     * Character classes include both upper and lower variants explicitly so the pattern
     * works regardless of the regex engine's Unicode case-folding behaviour.
     * e.g. "chateau" → [cCçÇ]h[aAàÀâÂäÄáÁãÃåÅ]t[eEéÉèÈêÊëË][aAàÀâÂäÄáÁãÃåÅ][uUùÙûÛüÜúÚűŰ]
     */
    private buildTokenPattern(token: string): string {
        const ACCENT_MAP: Record<string, string> = {
            a: '[aA\u00e0\u00c0\u00e2\u00c2\u00e4\u00c4\u00e1\u00c1\u00e3\u00c3\u00e5\u00c5]',
            e: '[eE\u00e9\u00c9\u00e8\u00c8\u00ea\u00ca\u00eb\u00cb]',
            i: '[iI\u00ee\u00ce\u00ef\u00cf\u00ed\u00cd\u00ec\u00cc]',
            o: '[oO\u00f4\u00d4\u00f6\u00d6\u00f3\u00d3\u00f2\u00d2\u00f5\u00d5\u00f8\u00d8]',
            u: '[uU\u00f9\u00d9\u00fb\u00db\u00fc\u00dc\u00fa\u00da\u0171\u0170]',
            c: '[cC\u00e7\u00c7]',
            n: '[nN\u00f1\u00d1]',
            y: '[yY\u00ff\u0178\u00fd\u00dd]',
        };
        return token
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .split('')
            .map(char => {
                if (ACCENT_MAP[char]) return ACCENT_MAP[char];
                return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            })
            .join('');
    }

    /**
     * Splits a query into significant tokens:
     *  - strips accents, lowercases, splits on whitespace/apostrophes/hyphens
     *  - removes French bridge/article words (de, la, les …)
     */
    private extractSearchTokens(query: string): string[] {
        const BRIDGE_WORDS = new Set([
            'le', 'la', 'les', 'des', 'de', 'du', 'd', 'l',
            'au', 'aux', 'en', 'et', 'un', 'une',
        ]);
        const raw = query
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/['\u2019\u2018\-]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 0);
        const significant = raw.filter(t => !BRIDGE_WORDS.has(t));
        return significant.length > 0 ? significant : raw;
    }

    /**
     * For a list of tokens and a field name, returns a MongoDB $and array
     * where every token must appear somewhere in that field.
     * Each token condition is an $or of the accent-insensitive pattern + plain escaped fallback.
     */
    private buildTokenAndConditions(field: string, tokens: string[]): Record<string, any>[] | null {
        if (tokens.length === 0) return null;
        return tokens.map(token => ({
            $or: [
                { [field]: { $regex: this.buildTokenPattern(token), $options: 'i' } },
                { [field]: { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
            ],
        }));
    }

    /** @deprecated kept for any callers outside unifiedSearch */
    private buildAccentInsensitivePattern(query: string): string {
        const tokens = this.extractSearchTokens(query);
        if (tokens.length === 0) return query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const patterns = tokens.map(t => this.buildTokenPattern(t));
        return patterns.length === 1 ? patterns[0] : patterns.map(p => `(?=.*${p})`).join('');
    }

    private buildExperienceRoute(regionName: string | null | undefined, domainSlugOrId: string): string {
        const regionSlug = slugify(regionName?.trim() || '') || 'domaine';
        return `/experience/${regionSlug}/${domainSlugOrId}`;
    }

    private async resolveRegionNameForCoordinates(latitude: number, longitude: number): Promise<string | null> {
        const matchedRegion = await this.regionModel.findOne({
            min_lat: { $lte: latitude },
            max_lat: { $gte: latitude },
            min_lon: { $lte: longitude },
            max_lon: { $gte: longitude },
        }).exec();
        return matchedRegion?.denom || null;
    }

    private async resolveRegionNameForStaticExperience(exp: {
        latitude?: number | null;
        longitude?: number | null;
        city?: string | null;
    }): Promise<string | null> {
        if (exp.latitude && exp.longitude) {
            const regionByCoords = await this.resolveRegionNameForCoordinates(exp.latitude, exp.longitude);
            if (regionByCoords) return regionByCoords;
        }
        if (exp.city) {
            const regionByCity = await this.regionModel.findOne({
                denom: { $regex: exp.city, $options: 'i' },
            }).exec();
            if (regionByCity) return regionByCity.denom;
        }
        return null;
    }

    private async pickSuggestedRoute(
        searchQuery: string,
        services: any[],
        domains: any[],
        regionResults: any[],
        staticExperienceResults: any[],
        builders: {
            buildServiceRoute: (service: any) => string;
            buildDomainRoute: (domain: any) => string;
        },
    ): Promise<{
        route: string;
        type: 'city' | 'service' | 'domain' | 'region' | 'static-experience' | 'mixed' | null;
    }> {
        type CandidateKind = 'city' | 'region' | 'domain' | 'service' | 'static-experience';
        type Candidate = { score: number; route: string; kind: CandidateKind; label: string };

        const TYPE_PRIORITY: Record<CandidateKind, number> = {
            city: 5,
            region: 4,
            domain: 3,
            'static-experience': 2,
            service: 1,
        };

        const candidates: Candidate[] = [];

        try {
            const cityResult = await this.citiesService.searchCities(searchQuery);
            const cities = cityResult?.data ?? [];
            for (const city of cities.slice(0, 8)) {
                const score = scoreSearchMatch(searchQuery, city.nom_standard);
                if (score <= 0) continue;

                const lat = city.latitude_centre;
                const lon = city.longitude_centre;
                const coords = lat != null && lon != null ? `?lat=${lat}&lon=${lon}` : '';

                candidates.push({
                    score,
                    route: `/region/${encodeURIComponent(city.nom_standard)}${coords}`,
                    kind: 'city',
                    label: city.nom_standard,
                });
            }
        } catch (error) {
            this.logger.warn(`City lookup failed during suggested-route resolution: ${(error as Error).message}`);
        }

        for (const region of regionResults) {
            const score = scoreSearchMatch(searchQuery, region.denom, region.slug);
            if (score <= 0) continue;
            candidates.push({
                score,
                route: `/region/${region.slug}`,
                kind: 'region',
                label: region.denom,
            });
        }

        for (const domain of domains) {
            const score = scoreSearchMatch(searchQuery, domain.domainName || '', domain.slug);
            if (score <= 0) continue;
            candidates.push({
                score,
                route: builders.buildDomainRoute(domain),
                kind: 'domain',
                label: domain.domainName || '',
            });
        }

        for (const exp of staticExperienceResults) {
            const score = scoreSearchMatch(searchQuery, exp.name, exp.slug);
            if (score <= 0) continue;
            candidates.push({
                score,
                route: exp.experienceRoute,
                kind: 'static-experience',
                label: exp.name,
            });
        }

        for (const service of services) {
            const score = scoreSearchMatch(searchQuery, service.serviceName);
            if (score <= 0) continue;
            candidates.push({
                score,
                route: builders.buildServiceRoute(service),
                kind: 'service',
                label: service.serviceName,
            });
        }

        if (candidates.length === 0) {
            return { route: '', type: null };
        }

        candidates.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const kindDiff = TYPE_PRIORITY[b.kind] - TYPE_PRIORITY[a.kind];
            if (kindDiff !== 0) return kindDiff;
            return a.label.localeCompare(b.label, 'fr');
        });

        const best = candidates[0];
        const hasMultipleKinds = new Set(candidates.map((candidate) => candidate.kind)).size > 1;
        const resultType = hasMultipleKinds ? 'mixed' : best.kind;

        this.logger.log(
            `Suggested route for "${searchQuery}": ${best.route} (${best.kind}, score=${best.score})`,
        );

        return { route: best.route, type: resultType };
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
        try {
            const backendUrl = this.configService.get<string>('BACKEND_URL') || '';
            const searchQuery = query.trim();
            const searchPattern = this.buildAccentInsensitivePattern(searchQuery);
            // Plain normalised pattern: accent-stripped, case-insensitive fallback
            // so simple queries always work even if the char-class pattern has PCRE edge cases.
            const plainPattern = searchQuery
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const normalizeStr = (s: string) =>
                s.normalize('NFD')
                 .replace(/[\u0300-\u036f]/g, '')
                 .toLowerCase()
                 .replace(/['\u2019\u2018]/g, ' ')
                 .replace(/\b(le|la|les|des|de|du|au|aux|en|et|un|une)\b/g, ' ')
                 .replace(/\s+/g, ' ')
                 .trim();
            const normalizedQuery = normalizeStr(searchQuery);
            // Split into tokens for flexible in-memory matching (handles multi-word queries)
            const queryTokens = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
            
            // Return early if query is empty after trimming
            if (!searchQuery) {
                return {
                    success: true,
                    data: {
                        type: null,
                        services: [],
                        domains: [],
                        regions: [],
                        staticExperiences: [],
                        suggestedRoute: ''
                    }
                };
            }
            
            const isNumeric = !isNaN(parseFloat(searchQuery));
            const numericQuery = isNumeric ? parseFloat(searchQuery) : null;

            this.logger.log(`Unified search for: "${searchQuery}" (numeric: ${isNumeric})`);

            // Extract significant tokens once – used for all collection queries
            const searchTokens = this.extractSearchTokens(searchQuery);

            // Helper: build a single-field per-token condition (all tokens must match, any order)
            const makeAndCond = (field: string) => {
                const conds = this.buildTokenAndConditions(field, searchTokens);
                if (!conds || conds.length === 0) return {};
                return conds.length === 1 ? conds[0] : { $and: conds };
            };

            // Service search: every token must match in name OR description OR language
            const servicePerToken = searchTokens.map(token => ({
                $or: [
                    { 'services.name':        { $regex: this.buildTokenPattern(token), $options: 'i' } },
                    { 'services.name':        { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { 'services.description': { $regex: this.buildTokenPattern(token), $options: 'i' } },
                    { 'services.description': { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { 'services.languagesOffered': { $in: [new RegExp(this.buildTokenPattern(token), 'i')] } },
                ],
            }));

            const serviceSearchConditions: any = {
                'services.isActive': true,
                ...(servicePerToken.length > 0
                    ? { $and: servicePerToken }
                    : {}),
            };

            if (numericQuery !== null) {
                serviceSearchConditions.$or = [{
                    'services.pricePerPerson': { $gte: numericQuery - 10, $lte: numericQuery + 10 },
                }];
            }

            // Static experience: every token must match name OR category OR city OR domain_name
            const staticPerToken = searchTokens.map(token => ({
                $or: [
                    { name:        { $regex: this.buildTokenPattern(token), $options: 'i' } },
                    { name:        { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { category:    { $regex: this.buildTokenPattern(token), $options: 'i' } },
                    { category:    { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { city:        { $regex: this.buildTokenPattern(token), $options: 'i' } },
                    { city:        { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                    { domain_name: { $regex: this.buildTokenPattern(token), $options: 'i' } },
                    { domain_name: { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
                ],
            }));

            const staticCond = staticPerToken.length > 0
                ? (staticPerToken.length === 1 ? staticPerToken[0] : { $and: staticPerToken })
                : {};

            const userConds  = this.buildTokenAndConditions('domainName', searchTokens);
            const userCond   = userConds
                ? (userConds.length === 1 ? userConds[0] : { $and: userConds })
                : null;

            const regionConds = this.buildTokenAndConditions('denom', searchTokens);
            const regionCond  = regionConds
                ? (regionConds.length === 1 ? regionConds[0] : { $and: regionConds })
                : null;

            // Run all independent queries in parallel for maximum speed
            const [domainProfilesWithServices, staticExperiences, usersWithDomains, regions] = await Promise.all([
                this.domainProfileModel
                    .find(serviceSearchConditions)
                    .populate('userId', 'domainName domainLatitude domainLongitude address city codePostal region')
                    .limit(20)
                    .lean()
                    .exec(),
                this.staticExperienceModel
                    .find(staticCond)
                    .limit(20)
                    .lean()
                    .exec(),
                userCond
                    ? this.userModel
                        .find(userCond)
                        .select('_id domainName domainLatitude domainLongitude address city codePostal region')
                        .limit(20)
                        .lean()
                        .exec()
                    : Promise.resolve([]),
                regionCond
                    ? this.regionModel
                        .find(regionCond)
                        .limit(20)
                        .lean()
                        .exec()
                    : Promise.resolve([]),
            ]);

        const services: any[] = [];
        for (const profile of domainProfilesWithServices) {
            const user = profile.userId as any;
            const profileDoc = profile as any;
            
            for (const service of profileDoc.services as any[]) {
                if (!service.isActive) continue;

                const matchesName = queryTokens.length > 0
                    ? queryTokens.every(t => normalizeStr(service.name).includes(t))
                    : normalizeStr(service.name).includes(normalizedQuery);
                const matchesDescription = service.description
                    ? (queryTokens.length > 0
                        ? queryTokens.every(t => normalizeStr(service.description).includes(t))
                        : normalizeStr(service.description).includes(normalizedQuery))
                    : false;
                const matchesLanguage = service.languagesOffered?.some((lang: string) =>
                    queryTokens.length > 0
                        ? queryTokens.every(t => normalizeStr(lang).includes(t))
                        : normalizeStr(lang).includes(normalizedQuery)
                );
                const matchesPrice = numericQuery !== null && 
                    Math.abs(service.pricePerPerson - numericQuery) <= 10;

                if (matchesName || matchesDescription || matchesLanguage || matchesPrice) {
                    const domain = {
                        domainId: profile._id.toString(),
                        slug: profileDoc.slug || null,
                        userId: user?._id || null,
                        domainName: user?.domainName || null,
                        domainDescription: profileDoc.domainDescription,
                        colorCode: profileDoc.colorCode,
                        region: user?.region || null,
                        city: user?.city || null,
                    };
                    services.push({
                        serviceId: service._id,
                        serviceName: service.name,
                        serviceDescription: service.description,
                        pricePerPerson: service.pricePerPerson,
                        languagesOffered: service.languagesOffered,
                        serviceBannerUrl: buildFullMediaUrl(service.serviceBannerUrl, backendUrl),
                        domain,
                        experienceRoute: this.buildExperienceRoute(
                            domain.region || domain.city || domain.domainName,
                            domain.slug || domain.domainId,
                        ),
                    });
                }
            }
        }

        const staticExperienceResults = await Promise.all((staticExperiences as any[]).map(async (exp) => {
            const domainId = exp._id.toString();
            const regionName = await this.resolveRegionNameForStaticExperience(exp);
            return {
                domainId,
                slug: exp.slug || null,
                domainName: exp.domain_name || exp.name,
                domainDescription: exp.domain_description || exp.about || exp.category || '',
                domainProfilePictureUrl: exp.domain_profile_pic_url || exp.main_image || null,
                domainLogoUrl: exp.domain_logo_url || null,
                name: exp.name,
                category: exp.category,
                address: exp.address,
                city: exp.city,
                region: regionName,
                latitude: exp.latitude,
                longitude: exp.longitude,
                rating: exp.rating,
                website: exp.website,
                mainImage: exp.main_image,
                about: exp.about,
                type: 'static-experience' as const,
                experienceRoute: this.buildExperienceRoute(regionName || exp.city, exp.slug || domainId),
            };
        }));

        // Domain profiles query (depends on usersWithDomains result from parallel block)
        const domainIds = (usersWithDomains as any[]).map(user => user._id);
        const domainProfiles = domainIds.length > 0
            ? await this.domainProfileModel
                .find({ userId: { $in: domainIds } })
                .populate('userId', 'domainName domainLatitude domainLongitude address city codePostal region')
                .lean()
                .exec()
            : [];

        const domains = (domainProfiles as any[]).map(profile => {
            const user = profile.userId as any;
            const location = {
                latitude: user?.domainLatitude || null,
                longitude: user?.domainLongitude || null,
                address: user?.address || null,
                city: user?.city || null,
                region: user?.region || null,
            };
            return {
                domainId: profile._id,
                slug: profile.slug || null,
                userId: user?._id || null,
                domainName: user?.domainName || null,
                domainDescription: profile.domainDescription,
                colorCode: profile.colorCode,
                domainProfilePictureUrl: buildFullMediaUrl(profile.domainProfilePictureUrl, backendUrl),
                domainLogoUrl: buildFullMediaUrl(profile.domainLogoUrl, backendUrl),
                location,
                experienceRoute: this.buildExperienceRoute(
                    location.region || location.city || user?.domainName,
                    profile.slug || profile._id.toString(),
                ),
            };
        });

        const seenRegionKeys = new Set<string>();
        const regionResults = (regions as any[]).reduce((acc, region) => {
            const normalizedDenom = normalizeStr(region?.denom || '');
            const dedupeKey = normalizedDenom || (region?.denom || '').trim().toLowerCase();

            if (!dedupeKey || seenRegionKeys.has(dedupeKey)) {
                return acc;
            }

            seenRegionKeys.add(dedupeKey);
            acc.push({
                denom: region.denom,
                slug: region.slug || slugify(region.denom || ''),
                min_lat: region.min_lat,
                min_lon: region.min_lon,
                max_lat: region.max_lat,
                max_lon: region.max_lon,
                thumbnailUrl: buildFullMediaUrl(region.thumbnailUrl, backendUrl),
                isParent: region.isParent,
            });

            return acc;
        }, [] as any[]).sort((a, b) =>
            compareSearchMatch(searchQuery, a.denom, b.denom, a.slug, b.slug),
        );

        services.sort((a, b) =>
            compareSearchMatch(searchQuery, a.serviceName, b.serviceName),
        );

        domains.sort((a, b) =>
            compareSearchMatch(searchQuery, a.domainName || '', b.domainName || '', a.slug, b.slug),
        );

        staticExperienceResults.sort((a, b) =>
            compareSearchMatch(searchQuery, a.name, b.name, a.slug, b.slug),
        );

        staticExperienceResults.sort((a, b) =>
            compareSearchMatch(searchQuery, a.name, b.name, a.slug, b.slug),
        );

        const { route: suggestedRoute, type } = await this.pickSuggestedRoute(
            searchQuery,
            services,
            domains,
            regionResults,
            staticExperienceResults,
            {
                buildServiceRoute: (service) =>
                    this.buildExperienceRoute(
                        service.domain.region || service.domain.city || service.domain.domainName,
                        service.domain.slug || service.domain.domainId,
                    ),
                buildDomainRoute: (domain) =>
                    this.buildExperienceRoute(
                        domain.location?.region || domain.location?.city || domain.domainName,
                        domain.slug || domain.domainId,
                    ),
            },
        );

        this.logger.log(`Search results: ${services.length} services, ${domains.length} domains, ${regionResults.length} regions, ${staticExperienceResults.length} static experiences`);

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
        } catch (error) {
            this.logger.error(`Unified search error: ${error.message}`, error.stack);
            return {
                success: false,
                data: {
                    type: null,
                    services: [],
                    domains: [],
                    regions: [],
                    staticExperiences: [],
                    suggestedRoute: ''
                }
            };
        }
    }

    // Admin CRUD operations
    async createRegion(createRegionDto: CreateRegionDto): Promise<Region> {
        try {
            // Check if region with same name already exists
            const existingRegion = await this.regionModel.findOne({ denom: createRegionDto.denom }).exec();
            if (existingRegion) {
                throw new BadRequestException(`Region with name "${createRegionDto.denom}" already exists`);
            }

            const slug = await ensureUniqueSlug(slugify(createRegionDto.denom), async (candidate) =>
                !!(await this.regionModel.exists({ slug: candidate })),
            );

            const region = new this.regionModel({ ...createRegionDto, slug });
            await region.save();
            
            this.logger.log(`Region created: ${region.denom} (slug: ${region.slug})`);
            return region;
        } catch (error) {
            this.logger.error(`Failed to create region: ${error.message}`);
            throw error;
        }
    }

    async updateRegion(id: string, updateRegionDto: UpdateRegionDto): Promise<Region> {
        try {
            // Check if region exists
            const region = await this.regionModel.findById(id).exec();
            if (!region) {
                throw new NotFoundException(`Region with ID "${id}" not found`);
            }

            // If updating denom, check for duplicates and recompute the slug
            if (updateRegionDto.denom && updateRegionDto.denom !== region.denom) {
                const existingRegion = await this.regionModel.findOne({ denom: updateRegionDto.denom }).exec();
                if (existingRegion) {
                    throw new BadRequestException(`Region with name "${updateRegionDto.denom}" already exists`);
                }

                region.slug = await ensureUniqueSlug(slugify(updateRegionDto.denom), async (candidate) =>
                    !!(await this.regionModel.exists({ slug: candidate, _id: { $ne: region._id } })),
                );
            }

            // Update region
            Object.assign(region, updateRegionDto);
            await region.save();
            
            this.logger.log(`Region updated: ${region.denom} (slug: ${region.slug})`);
            return region;
        } catch (error) {
            this.logger.error(`Failed to update region: ${error.message}`);
            throw error;
        }
    }

    async deleteRegion(id: string): Promise<{ success: boolean; message: string }> {
        try {
            const region = await this.regionModel.findById(id).exec();
            if (!region) {
                throw new NotFoundException(`Region with ID "${id}" not found`);
            }

            // Delete thumbnail from S3 if exists
            if (region.thumbnailUrl) {
                try {
                    const key = this.extractS3KeyFromUrl(region.thumbnailUrl);
                    await this.s3Service.deleteFile(key);
                } catch (error) {
                    this.logger.warn(`Failed to delete thumbnail from S3: ${error.message}`);
                }
            }

            await region.deleteOne();
            
            this.logger.log(`Region deleted: ${region.denom}`);
            return {
                success: true,
                message: `Region "${region.denom}" deleted successfully`
            };
        } catch (error) {
            this.logger.error(`Failed to delete region: ${error.message}`);
            throw error;
        }
    }

    async uploadRegionThumbnail(id: string, file: Express.Multer.File): Promise<{ success: boolean; thumbnailUrl: string }> {
        try {
            const region = await this.regionModel.findById(id).exec();
            if (!region) {
                throw new NotFoundException(`Region with ID "${id}" not found`);
            }

            // Delete old thumbnail if exists
            if (region.thumbnailUrl) {
                try {
                    const oldKey = this.extractS3KeyFromUrl(region.thumbnailUrl);
                    await this.s3Service.deleteFile(oldKey);
                } catch (error) {
                    this.logger.warn(`Failed to delete old thumbnail: ${error.message}`);
                }
            }

            // Upload new thumbnail to S3
            const folder = 'regions/thumbnails';
            const { url } = await this.s3Service.uploadFile(file, undefined, folder);

            // Update region with new thumbnail URL
            region.thumbnailUrl = url;
            await region.save();

            this.logger.log(`Thumbnail uploaded for region: ${region.denom}`);
            return {
                success: true,
                thumbnailUrl: url
            };
        } catch (error) {
            this.logger.error(`Failed to upload thumbnail: ${error.message}`);
            throw error;
        }
    }

    async deleteRegionThumbnail(id: string): Promise<{ success: boolean; message: string }> {
        try {
            const region = await this.regionModel.findById(id).exec();
            if (!region) {
                throw new NotFoundException(`Region with ID "${id}" not found`);
            }

            if (!region.thumbnailUrl) {
                return {
                    success: true,
                    message: 'No thumbnail to delete'
                };
            }

            // Delete from S3
            try {
                const key = this.extractS3KeyFromUrl(region.thumbnailUrl);
                await this.s3Service.deleteFile(key);
            } catch (error) {
                this.logger.warn(`Failed to delete thumbnail from S3: ${error.message}`);
            }

            // Update region
            region.thumbnailUrl = '';
            await region.save();

            this.logger.log(`Thumbnail deleted for region: ${region.denom}`);
            return {
                success: true,
                message: 'Thumbnail deleted successfully'
            };
        } catch (error) {
            this.logger.error(`Failed to delete thumbnail: ${error.message}`);
            throw error;
        }
    }

    private extractS3KeyFromUrl(url: string): string {
        // Format 1: https://bucket.s3.region.amazonaws.com/key
        // Format 2: https://s3.region.amazonaws.com/bucket/key
        // Format 3: https://bucket.s3.amazonaws.com/key
        try {
            const parsed = new URL(url);
            const host = parsed.hostname; // e.g. rosedesvins.s3.us-east-1.amazonaws.com
            const pathname = parsed.pathname; // e.g. /regions/file.jpg

            if (host.includes('.amazonaws.com')) {
                // Path-style: s3.region.amazonaws.com/bucket/key
                if (host.startsWith('s3.')) {
                    // Remove leading /bucket/ from pathname
                    const parts = pathname.split('/').filter(Boolean);
                    return parts.slice(1).join('/');
                }
                // Virtual-hosted-style: bucket.s3.region.amazonaws.com/key
                return pathname.startsWith('/') ? pathname.slice(1) : pathname;
            }
        } catch (_) {
            // fall through
        }
        // Fallback: split on .amazonaws.com/
        const parts = url.split('.amazonaws.com/');
        return parts.length > 1 ? parts[1] : url;
    }

    async convertThumbnailsToWebp(): Promise<{
        success: boolean;
        total: number;
        compressed: number;
        skipped: number;
        failed: number;
        results: Array<{ denom: string; status: string; originalKB?: number; compressedKB?: number; url?: string; error?: string }>;
    }> {
        const results: Array<{ denom: string; status: string; originalKB?: number; compressedKB?: number; url?: string; error?: string }> = [];
        let compressed = 0;
        let skipped = 0;
        let failed = 0;

        const regions = await this.regionModel.find({ thumbnailUrl: { $ne: '' } }).exec();
        this.logger.log(`Starting compression for ${regions.length} regions with thumbnails`);

        for (const region of regions) {
            const url = region.thumbnailUrl;

            try {
                // Download original image
                this.logger.log(`Downloading: ${region.denom} — ${url}`);
                const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
                const originalBuffer = Buffer.from(response.data);
                const originalSize = originalBuffer.byteLength;

                // Detect format from Content-Type or URL
                const contentType: string = response.headers['content-type'] || '';
                const isJpeg = contentType.includes('jpeg') || /\.(jpg|jpeg)$/i.test(url);
                const isPng  = contentType.includes('png')  || /\.png$/i.test(url);

                // Compress: resize to max 1200px wide, keep aspect ratio, quality 80
                let compressedBuffer: Buffer;
                let outputMime: string;

                if (isPng) {
                    compressedBuffer = await sharp(originalBuffer)
                        .resize({ width: 1200, withoutEnlargement: true })
                        .png({ compressionLevel: 9, quality: 80 })
                        .toBuffer();
                    outputMime = 'image/png';
                } else {
                    // Default: JPEG (covers jpg, jpeg, unknown)
                    compressedBuffer = await sharp(originalBuffer)
                        .resize({ width: 1200, withoutEnlargement: true })
                        .jpeg({ quality: 80, progressive: true })
                        .toBuffer();
                    outputMime = 'image/jpeg';
                }

                const newSize = compressedBuffer.byteLength;
                const originalKB = Math.round(originalSize / 1024);
                const compressedKB = Math.round(newSize / 1024);
                this.logger.log(`${region.denom}: ${originalKB}KB → ${compressedKB}KB`);

                // If compressed size is not meaningfully smaller, skip overwrite
                if (newSize >= originalSize * 0.95) {
                    this.logger.log(`Skipping ${region.denom} — no significant size reduction`);
                    results.push({ denom: region.denom, status: 'skipped', originalKB, compressedKB, url });
                    skipped++;
                    continue;
                }

                // Build new key with timestamp in filename, keep same folder
                const oldKey = this.extractS3KeyFromUrl(url);
                this.logger.log(`Old S3 key to delete: "${oldKey}"`);
                const folder = oldKey.includes('/') ? oldKey.substring(0, oldKey.lastIndexOf('/')) : '';
                const ext = isPng ? 'png' : 'jpg';
                const timestamp = Date.now();
                const newFileName = `region_thumbnail_${timestamp}.${ext}`;
                const newKey = folder ? `${folder}/${newFileName}` : newFileName;

                // Upload compressed file under new timestamped key
                const { url: newUrl } = await this.s3Service.uploadFileByKey(newKey, compressedBuffer, outputMime);

                // Delete old file from S3
                this.logger.log(`Deleting old S3 key: "${oldKey}"`);
                await this.s3Service.deleteFile(oldKey);
                this.logger.log(`Deleted old S3 key: "${oldKey}"`);

                // Update DB record with new URL
                region.thumbnailUrl = newUrl;
                await region.save();

                results.push({ denom: region.denom, status: 'compressed', originalKB, compressedKB, url: newUrl });
                compressed++;
            } catch (error) {
                this.logger.error(`Failed to compress thumbnail for ${region.denom}: ${error.message}`);
                results.push({ denom: region.denom, status: 'failed', url, error: error.message });
                failed++;
            }
        }

        this.logger.log(`Compression complete — compressed: ${compressed}, skipped: ${skipped}, failed: ${failed}`);
        return { success: true, total: regions.length, compressed, skipped, failed, results };
    }

    /**
     * One-off backfill: compute & persist a unique `slug` for every Region,
     * DomainProfile and StaticExperience that doesn't have one yet.
     * Safe to re-run — documents that already have a slug are left untouched.
     * DomainProfile/StaticExperience share a single URL namespace (both used
     * as the last segment of `/experience/{regionSlug}/{domainSlug}`), so
     * their uniqueness is enforced against each other as well.
     */
    async backfillAllSlugs(): Promise<{
        success: boolean;
        regions: { total: number; updated: number };
        domainProfiles: { total: number; updated: number };
        staticExperiences: { total: number; updated: number };
    }> {
        // --- Regions ---------------------------------------------------------
        const regionsWithoutSlug = await this.regionModel
            .find({ $or: [{ slug: null }, { slug: { $exists: false } }, { slug: '' }] })
            .exec();

        const existingRegionSlugs = new Set(
            (await this.regionModel.find({ slug: { $nin: [null, ''] } }).select('slug').lean().exec())
                .map((r: any) => r.slug as string),
        );

        let regionsUpdated = 0;
        for (const region of regionsWithoutSlug) {
            const baseSlug = slugify(region.denom) || 'region';
            const slug = await ensureUniqueSlug(baseSlug, async (candidate) => existingRegionSlugs.has(candidate));
            existingRegionSlugs.add(slug);
            // Use $set so we only write `slug` and skip full-document validation
            // (legacy docs may have empty required fields that would otherwise fail).
            await this.regionModel.updateOne({ _id: region._id }, { $set: { slug } }).exec();
            regionsUpdated++;
        }

        // --- Domain profiles + static experiences (shared namespace) --------
        const usedDomainSlugs = new Set(
            [
                ...(await this.domainProfileModel.find({ slug: { $nin: [null, ''] } }).select('slug').lean().exec()),
                ...(await this.staticExperienceModel.find({ slug: { $nin: [null, ''] } }).select('slug').lean().exec()),
            ].map((doc: any) => doc.slug as string),
        );

        const domainProfilesWithoutSlug = await this.domainProfileModel
            .find({ $or: [{ slug: null }, { slug: { $exists: false } }, { slug: '' }] })
            .populate('userId', 'domainName')
            .exec();

        let domainProfilesUpdated = 0;
        for (const profile of domainProfilesWithoutSlug) {
            const user = profile.userId as any;
            const baseName = user?.domainName || 'domaine';
            const baseSlug = slugify(baseName) || 'domaine';
            const slug = await ensureUniqueSlug(baseSlug, async (candidate) => usedDomainSlugs.has(candidate));
            usedDomainSlugs.add(slug);
            // Avoid profile.save() — production DomainProfiles often have empty
            // required fields (e.g. domainDescription: '') that fail Mongoose
            // validation when the whole document is re-saved.
            await this.domainProfileModel.updateOne({ _id: profile._id }, { $set: { slug } }).exec();
            domainProfilesUpdated++;
        }

        const staticExperiencesWithoutSlug = await this.staticExperienceModel
            .find({ $or: [{ slug: null }, { slug: { $exists: false } }, { slug: '' }] })
            .exec();

        let staticExperiencesUpdated = 0;
        for (const exp of staticExperiencesWithoutSlug) {
            const baseSlug = slugify(exp.name) || 'experience';
            const slug = await ensureUniqueSlug(baseSlug, async (candidate) => usedDomainSlugs.has(candidate));
            usedDomainSlugs.add(slug);
            await this.staticExperienceModel.updateOne({ _id: exp._id }, { $set: { slug } }).exec();
            staticExperiencesUpdated++;
        }

        this.logger.log(
            `Slug backfill complete — regions: ${regionsUpdated}/${regionsWithoutSlug.length}, ` +
            `domain profiles: ${domainProfilesUpdated}/${domainProfilesWithoutSlug.length}, ` +
            `static experiences: ${staticExperiencesUpdated}/${staticExperiencesWithoutSlug.length}`,
        );

        return {
            success: true,
            regions: { total: regionsWithoutSlug.length, updated: regionsUpdated },
            domainProfiles: { total: domainProfilesWithoutSlug.length, updated: domainProfilesUpdated },
            staticExperiences: { total: staticExperiencesWithoutSlug.length, updated: staticExperiencesUpdated },
        };
    }

    /**
     * Every publicly reachable `/experience/{regionSlug}/{domainSlug}` and
     * `/region/{regionSlug}` path, for sitemap generation. Only entries with a
     * real (already-backfilled) slug are included — nothing here ever falls
     * back to a raw Mongo ID, so the sitemap never leaks legacy ID-based URLs.
     * Covers ALL DomainProfiles and StaticExperiences regardless of whether
     * they currently have any active services (fixes gaps where a domain
     * without services was previously missing from the sitemap entirely).
     */
    async getAllPublicSlugPaths(): Promise<{
        regions: Array<{ path: string; updatedAt?: Date }>;
        experiences: Array<{ path: string; updatedAt?: Date }>;
    }> {
        const [regions, domainProfiles, staticExperiences] = await Promise.all([
            this.regionModel
                .find({ slug: { $nin: [null, ''] } })
                .select('slug denom updatedAt min_lat max_lat min_lon max_lon')
                .lean()
                .exec(),
            this.domainProfileModel
                .find({ slug: { $nin: [null, ''] } })
                .populate('userId', 'domainName region city')
                .select('slug updatedAt userId')
                .lean()
                .exec(),
            this.staticExperienceModel
                .find({ slug: { $nin: [null, ''] } })
                .select('slug updatedAt name city latitude longitude')
                .lean()
                .exec(),
        ]);

        const seenRegionPaths = new Set<string>();
        const regionPaths = (regions as any[]).reduce((acc, region) => {
            const path = `/region/${region.slug}`;
            if (seenRegionPaths.has(path)) return acc;
            seenRegionPaths.add(path);
            acc.push({ path, updatedAt: region.updatedAt });
            return acc;
        }, [] as Array<{ path: string; updatedAt?: Date }>);

        const seenExperiencePaths = new Set<string>();
        const experiencePaths: Array<{ path: string; updatedAt?: Date }> = [];

        for (const profile of domainProfiles as any[]) {
            const user = profile.userId as any;
            const regionName = user?.region || user?.city || user?.domainName;
            const regionSlug = slugify(regionName?.trim() || '') || 'domaine';
            const path = `/experience/${regionSlug}/${profile.slug}`;
            if (seenExperiencePaths.has(path)) continue;
            seenExperiencePaths.add(path);
            experiencePaths.push({ path, updatedAt: profile.updatedAt });
        }

        // Resolve each static experience's region in-memory against the
        // already-fetched region list (mirrors resolveRegionNameForStaticExperience,
        // but avoids a per-document DB round-trip — there can be thousands of
        // static experiences, which made the sequential-await version time out).
        const regionByCoords = (lat?: number | null, lon?: number | null): string | null => {
            if (lat == null || lon == null) return null;
            const match = (regions as any[]).find(
                (r) => r.min_lat <= lat && r.max_lat >= lat && r.min_lon <= lon && r.max_lon >= lon,
            );
            return match?.denom || null;
        };
        const regionByCity = (city?: string | null): string | null => {
            if (!city) return null;
            try {
                const re = new RegExp(city, 'i');
                return (regions as any[]).find((r) => re.test(r.denom))?.denom || null;
            } catch {
                return null;
            }
        };

        for (const exp of staticExperiences as any[]) {
            const regionName = regionByCoords(exp.latitude, exp.longitude) || regionByCity(exp.city);
            const regionSlug = slugify((regionName || exp.city || '').trim()) || 'domaine';
            const path = `/experience/${regionSlug}/${exp.slug}`;
            if (seenExperiencePaths.has(path)) continue;
            seenExperiencePaths.add(path);
            experiencePaths.push({ path, updatedAt: exp.updatedAt });
        }

        return { regions: regionPaths, experiences: experiencePaths };
    }
}