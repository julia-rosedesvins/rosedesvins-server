import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

@Schema({ _id: false })
export class Service {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, min: 1 })
  numberOfPeople: number;

  @Prop({ required: true, min: 0 })
  pricePerPerson: number;

  @Prop({ required: true, min: 1 })
  timeOfServiceInMinutes: number;

  @Prop({ required: true, min: 0 })
  numberOfWinesTasted: number;

  @Prop({ type: [String], required: true })
  languagesOffered: string[];

  @Prop({ default: true })
  isActive: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);

@Schema({
  timestamps: true,
  collection: 'domain-profiles',
})
export class DomainProfile extends Document {
  @Prop({ 
    type: Types.ObjectId, 
    ref: User.name, 
    required: true,
    unique: true,
    index: true 
  })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  domainDescription: string;

  @Prop({ trim: true })
  domainProfilePictureUrl?: string;

  @Prop({ trim: true })
  domainLogoUrl?: string;

  @Prop({ 
    required: true, 
    trim: true,
    match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    default: '#3A7B59'
  })
  colorCode: string;

  @Prop({ type: [ServiceSchema], default: [] })
  services: Service[];

  createdAt: Date;
  updatedAt: Date;
}

export const DomainProfileSchema = SchemaFactory.createForClass(DomainProfile);

// Indexes
DomainProfileSchema.index({ userId: 1 });
DomainProfileSchema.index({ 'services.isActive': 1 });
DomainProfileSchema.index({ createdAt: -1 });
