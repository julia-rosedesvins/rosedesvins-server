import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({
  timestamps: true,
})
export class StaticExperience extends Document {
  @Prop({
    type: String,
    required: true,
    trim: true
  })
  name: string;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  category: string | null;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  address: string | null;

  @Prop({
    type: String,
    required: false,
    default: null,
    index: true
  })
  city: string | null;

  @Prop({
    type: Number,
    required: false,
    default: null,
    index: true
  })
  latitude: number | null;

  @Prop({
    type: Number,
    required: false,
    default: null,
    index: true
  })
  longitude: number | null;

  @Prop({
    type: Number,
    required: false,
    default: null,
    min: 0,
    max: 5
  })
  rating: number | null;

  @Prop({
    type: Number,
    required: false,
    default: 0
  })
  reviews: number;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  website: string | null;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  phone: string | null;

  @Prop({
    type: Map,
    of: [String],
    required: false,
    default: null
  })
  opening_hours: Map<string, string[]> | null;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  main_image: string | null;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  image_1: string | null;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  image_2: string | null;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  about: string | null;

  @Prop({
    type: String,
    required: false,
    default: null
  })
  url: string | null;
}

export const StaticExperienceSchema = SchemaFactory.createForClass(StaticExperience);

// Create indexes for better query performance
StaticExperienceSchema.index({ city: 1, category: 1 });
StaticExperienceSchema.index({ latitude: 1, longitude: 1 });
StaticExperienceSchema.index({ rating: -1 });
StaticExperienceSchema.index({ name: 'text', category: 'text', city: 'text' });
