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
            const searchRegex = new RegExp(searchQuery, 'i');

            // Search in nom_standard, nom_sans_accent, and nom_standard_majuscule
            const cities = await this.cityModel
                .find({
                    $or: [
                        { nom_standard: { $regex: searchRegex } },
                        { nom_sans_accent: { $regex: searchRegex } },
                        { nom_standard_majuscule: { $regex: searchRegex } }
                    ]
                })
                .limit(10)
                .lean()
                .exec();

            // Calculate relevance scores
            const scoredCities = cities.map((city: any) => {
                const searchLower = searchQuery.toLowerCase();
                const nomStandardLower = city.nom_standard.toLowerCase();
                const nomSansAccentLower = city.nom_sans_accent.toLowerCase();

                let score = 0;
                
                // Exact match gets highest score
                if (nomStandardLower === searchLower || nomSansAccentLower === searchLower) {
                    score = 100;
                } else if (nomStandardLower.startsWith(searchLower) || nomSansAccentLower.startsWith(searchLower)) {
                    score = 90;
                } else if (nomStandardLower.includes(searchLower) || nomSansAccentLower.includes(searchLower)) {
                    const position = Math.min(
                        nomStandardLower.indexOf(searchLower),
                        nomSansAccentLower.indexOf(searchLower)
                    );
                    score = 50 - position;
                }

                return {
                    ...city,
                    score
                };
            });

            // Sort by score descending
            scoredCities.sort((a, b) => b.score - a.score);

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
