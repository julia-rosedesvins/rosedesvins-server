import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

@Schema()
export class Service {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, trim: true })
  numberOfPeople: string;

  @Prop({ required: true, min: 0 })
  pricePerPerson: number;

  @Prop({ required: true, min: 1 })
  timeOfServiceInMinutes: number;

  @Prop({ required: true, min: 0 })
  numberOfWinesTasted: number;

  @Prop({ type: [String], required: true })
  languagesOffered: string[];

  @Prop({ required: false, trim: true })
  serviceBannerUrl: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  bookingRestrictionActive: boolean;

  @Prop({ 
    type: String,
    enum: ['24h', '48h'],
    default: '24h'
  })
  bookingRestrictionTime: string;

  @Prop({ default: false })
  multipleBookings: boolean;

  @Prop({ default: false })
  hasCustomAvailability: boolean;

  @Prop({
    type: [{
      date: { type: Date, required: true },
      enabled: { type: Boolean, default: false },
      morningEnabled: { type: Boolean, default: false },
      morningFrom: { type: String, default: '' },
      morningTo: { type: String, default: '' },
      afternoonEnabled: { type: Boolean, default: false },
      afternoonFrom: { type: String, default: '' },
      afternoonTo: { type: String, default: '' }
    }],
    default: []
  })
  dateAvailability: {
    date: Date;
    enabled: boolean;
    morningEnabled: boolean;
    morningFrom: string;
    morningTo: string;
    afternoonEnabled: boolean;
    afternoonFrom: string;
    afternoonTo: string;
  }[];
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
