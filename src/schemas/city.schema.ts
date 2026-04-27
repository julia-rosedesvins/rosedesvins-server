import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
    timestamps: true,
})
export class City extends Document {
    @Prop({
        type: String,
        required: true,
    })
    nom_standard: string;

    @Prop({
        type: String,
        required: true,
        index: true,
    })
    nom_sans_accent: string;

    @Prop({
        type: String,
        required: true,
    })
    nom_standard_majuscule: string;

    @Prop({
        type: Number,
        required: true,
    })
    code_postal: number;

    @Prop({
        type: String,
        required: true,
    })
    codes_postaux: string;

    @Prop({
        type: Number,
        required: true,
    })
    population: number;

    @Prop({
        type: Number,
        required: true,
    })
    latitude_centre: number;

    @Prop({
        type: Number,
        required: true,
    })
    longitude_centre: number;
}

export const CitySchema = SchemaFactory.createForClass(City);

// Compound index for fast prefix/contains search on city names
CitySchema.index({ nom_standard: 1 });
CitySchema.index({ nom_standard_majuscule: 1 });
// Text index for full-text search fallback
CitySchema.index({ nom_standard: 'text', nom_sans_accent: 'text' });
