import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City } from '../schemas/city.schema';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CitiesService {
    private readonly logger = new Logger(CitiesService.name);

    constructor(
        @InjectModel(City.name) private cityModel: Model<City>,
    ) {}

    private normalizeText(value: string): string {
        return value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/['\u2019\u2018\-]/g, ' ')
            .replace(/\b(le|la|les|des|de|du|d|l|au|aux|en|et|un|une)\b/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private tokenize(value: string): string[] {
        return this.normalizeText(value).split(/\s+/).filter(Boolean);
    }

    private escapeRegex(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Small Levenshtein implementation for typo tolerance
    private levenshtein(a: string, b: string): number {
        const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
        for (let i = 0; i <= a.length; i++) dp[i][0] = i;
        for (let j = 0; j <= b.length; j++) dp[0][j] = j;

        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost,
                );
            }
        }
        return dp[a.length][b.length];
    }

    private allowedDistance(tokenLength: number): number {
        if (tokenLength >= 10) return 2;
        if (tokenLength >= 6) return 1;
        return 0;
    }

    private tokenMatches(cityTokens: string[], queryToken: string): boolean {
        // direct substring / prefix
        if (cityTokens.some(t => t.includes(queryToken) || queryToken.includes(t))) {
            return true;
        }

        const maxDist = this.allowedDistance(queryToken.length);
        if (maxDist === 0) return false;

        // fuzzy token match (for small typos: missing char, swapped char, etc.)
        return cityTokens.some(t => {
            // quick pre-filter to avoid expensive distance on unrelated tokens
            if (t[0] !== queryToken[0]) return false;
            return this.levenshtein(t, queryToken) <= maxDist;
        });
    }

    async loadCitiesFromJson(): Promise<{ success: boolean; message: string; count: number }> {
        try {
            // Path to the JSON file
            const citiesFilePath = path.join(process.cwd(), '..', 'docs', 'cities.json');

            this.logger.log(`Reading cities from: ${citiesFilePath}`);

            // Check if file exists
            if (!fs.existsSync(citiesFilePath)) {
                throw new Error(`File not found: ${citiesFilePath}`);
            }

            // Read the cities.json file
            const citiesContent = fs.readFileSync(citiesFilePath, 'utf-8');
            const citiesData = JSON.parse(citiesContent);

            this.logger.log(`Found ${citiesData.length} cities in JSON file`);

            // Clear existing cities
            await this.cityModel.deleteMany({});
            this.logger.log('Cleared existing cities from database');

            // Filter and validate data
            const validCities = citiesData.filter((city: any) => {
                const isValid = city.nom_standard && 
                               city.nom_sans_accent && 
                               city.nom_standard_majuscule &&
                               typeof city.code_postal !== 'undefined' &&
                               typeof city.population === 'number' &&
                               typeof city.latitude_centre === 'number' &&
                               typeof city.longitude_centre === 'number';
                
                if (!isValid) {
                    this.logger.warn(`Skipping invalid city entry: ${JSON.stringify(city)}`);
                }
                return isValid;
            });

            this.logger.log(`Validated ${validCities.length} cities`);

            // Insert cities in batches to avoid memory issues
            const batchSize = 1000;
            let insertedCount = 0;

            for (let i = 0; i < validCities.length; i += batchSize) {
                const batch = validCities.slice(i, i + batchSize);
                await this.cityModel.insertMany(batch);
                insertedCount += batch.length;
                this.logger.log(`Inserted ${insertedCount}/${validCities.length} cities`);
            }

            this.logger.log(`Successfully loaded ${insertedCount} cities into database`);

            return {
                success: true,
                message: `Successfully loaded ${insertedCount} cities`,
                count: insertedCount,
            };
        } catch (error) {
            this.logger.error(`Error loading cities from JSON: ${error.message}`, error.stack);
            throw error;
        }
    }

    async searchCities(query: string): Promise<any> {
        try {
            if (!query || query.trim().length < 2) {
                return {
                    success: true,
                    data: [],
                    message: 'Query too short'
                };
            }

            const searchQuery = query.trim();
            const normalizedQuery = this.normalizeText(searchQuery);
            const queryTokens = this.tokenize(searchQuery);

            // Broad candidate query: each token contributes a stem condition.
            // This catches slight typos like missing trailing 's' (fargue -> fargues).
            const tokenStemConditions = queryTokens.map(token => {
                const stem = token.length >= 5 ? token.slice(0, token.length - 1) : token;
                const safeStem = this.escapeRegex(stem);
                return {
                    $or: [
                        { nom_sans_accent: { $regex: safeStem, $options: 'i' } },
                        { nom_standard: { $regex: safeStem, $options: 'i' } },
                    ],
                };
            });

            const candidateQuery = tokenStemConditions.length > 0
                ? { $and: tokenStemConditions }
                : {
                    $or: [
                        { nom_standard: { $regex: this.escapeRegex(normalizedQuery), $options: 'i' } },
                        { nom_sans_accent: { $regex: this.escapeRegex(normalizedQuery), $options: 'i' } },
                    ],
                };

            const candidates = await this.cityModel
                .find(candidateQuery)
                .limit(120)
                .lean()
                .exec();

            const scoredCities = candidates
                .map((city: any) => {
                    const nomStandardNorm = this.normalizeText(city.nom_standard || '');
                    const nomSansAccentNorm = this.normalizeText(city.nom_sans_accent || city.nom_standard || '');
                    const cityTokens = this.tokenize(nomSansAccentNorm);

                    let score = 0;

                    // Strong exact / prefix / substring scoring
                    if (nomStandardNorm === normalizedQuery || nomSansAccentNorm === normalizedQuery) {
                        score = 120;
                    } else if (nomStandardNorm.startsWith(normalizedQuery) || nomSansAccentNorm.startsWith(normalizedQuery)) {
                        score = 105;
                    } else if (nomStandardNorm.includes(normalizedQuery) || nomSansAccentNorm.includes(normalizedQuery)) {
                        score = 90;
                    }

                    // Token-level matching (order-independent)
                    const matchedTokens = queryTokens.filter(t => this.tokenMatches(cityTokens, t)).length;
                    const tokenRatio = queryTokens.length > 0 ? matchedTokens / queryTokens.length : 0;
                    score += Math.round(tokenRatio * 80);

                    // Slight bonus for common prefix on first token
                    if (queryTokens.length > 0 && cityTokens.length > 0 && cityTokens[0].startsWith(queryTokens[0].slice(0, 3))) {
                        score += 8;
                    }

                    return {
                        ...city,
                        score,
                    };
                })
                .filter((city: any) => city.score >= 40)
                .sort((a: any, b: any) => b.score - a.score)
                .slice(0, 10);

            this.logger.log(`Found ${scoredCities.length} cities matching query: ${query}`);

            return {
                success: true,
                data: scoredCities,
                count: scoredCities.length
            };
        } catch (error) {
            this.logger.error(`Error searching cities: ${error.message}`, error.stack);
            throw error;
        }
    }
}
