import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OutilDocument = Outil & Document;

@Schema({ timestamps: true, collection: 'outils' })
export class Outil {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  thumbnail: string;
}

export const OutilSchema = SchemaFactory.createForClass(Outil);
