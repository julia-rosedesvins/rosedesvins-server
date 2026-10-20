import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class ExperienceCategory extends Document {
  @Prop({ required: true, unique: true })
  category_name: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: '' })
  imageUrl: string;
}

export const ExperienceCategorySchema = SchemaFactory.createForClass(ExperienceCategory);
