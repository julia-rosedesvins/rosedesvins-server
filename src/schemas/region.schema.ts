import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
    timestamps: true,
})
export class Region extends Document {
    @Prop({
        type: String,
        required: true,
        index: true,
    })
    denom: string;

    @Prop({
        type: Number,
        required: true,
    })
    min_lat: number;

    @Prop({
        type: Number,
        required: true,
    })
    min_lon: number;

    @Prop({
        type: Number,
        required: true,
    })
    max_lat: number;

    @Prop({
        type: Number,
        required: true,
    })
    max_lon: number;

    @Prop({
        type: String,
        default: '',
    })
    thumbnailUrl: string;
}

export const RegionSchema = SchemaFactory.createForClass(Region);

// Create indexes for geospatial queries
RegionSchema.index({ min_lat: 1, min_lon: 1 });
RegionSchema.index({ max_lat: 1, max_lon: 1 });
RegionSchema.index({ denom: 'text' });
