import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

// Orange connector credentials sub-schema
@Schema({ _id: false })
export class OrangeCredentials {
  @Prop({ required: true, trim: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: true })
  isValid: boolean;
}

export const OrangeCredentialsSchema = SchemaFactory.createForClass(OrangeCredentials);

// OVH connector credentials sub-schema (empty for now)
@Schema({ _id: false })
export class OvhCredentials {
  // Currently empty - to be implemented later
}

export const OvhCredentialsSchema = SchemaFactory.createForClass(OvhCredentials);

// Microsoft connector credentials sub-schema
@Schema({ _id: false })
export class MicrosoftCredentials {
  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ required: true })
  tokenType: string;

  @Prop({ required: true })
  expiresIn: number;

  @Prop({ required: true })
  scope: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ trim: true })
  userPrincipalName?: string;

  @Prop({ trim: true })
  displayName?: string;

  @Prop({ trim: true })
  mail?: string;

  @Prop({ trim: true })
  microsoftUserId?: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: true })
  isValid: boolean;

  @Prop({ default: Date.now })
  connectedAt: Date;
}

export const MicrosoftCredentialsSchema = SchemaFactory.createForClass(MicrosoftCredentials);

// Google connector credentials sub-schema
@Schema({ _id: false })
export class GoogleCredentials {
  @Prop({ required: true })
  accessToken: string;

  @Prop({ required: true })
  refreshToken: string;

  @Prop({ required: true })
  tokenType: string;

  @Prop({ required: true })
  expiresIn: number;

  @Prop({ required: true })
  scope: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ trim: true })
  email?: string;

  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  givenName?: string;

  @Prop({ trim: true })
  familyName?: string;

  @Prop({ trim: true })
  picture?: string;

  @Prop({ trim: true })
  googleUserId?: string;

  @Prop({ default: true })
  verifiedEmail?: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: true })
  isValid: boolean;

  @Prop({ default: Date.now })
  connectedAt: Date;
}

export const GoogleCredentialsSchema = SchemaFactory.createForClass(GoogleCredentials);

// Connector credentials sub-schema
@Schema({ _id: false })
export class ConnectorCredentials {
  @Prop({ type: OrangeCredentialsSchema, default: null })
  orange?: OrangeCredentials | null;

  @Prop({ type: OvhCredentialsSchema, default: null })
  ovh?: OvhCredentials | null;

  @Prop({ type: MicrosoftCredentialsSchema, default: null })
  microsoft?: MicrosoftCredentials | null;

  @Prop({ type: GoogleCredentialsSchema, default: null })
  google?: GoogleCredentials | null;
}

export const ConnectorCredentialsSchema = SchemaFactory.createForClass(ConnectorCredentials);

// Main Connector schema
@Schema({
  timestamps: true,
  collection: 'connectors',
})
export class Connector extends Document {
  @Prop({ 
    type: Types.ObjectId, 
    ref: User.name, 
    required: true,
    index: true 
  })
  userId: Types.ObjectId;

  @Prop({ 
    required: true,
    enum: ['orange', 'ovh', 'microsoft', 'google', 'none'],
    lowercase: true,
    trim: true
  })
  connector_name: string;

  @Prop({ 
    type: ConnectorCredentialsSchema,
    required: true
  })
  connector_creds: ConnectorCredentials;

  createdAt: Date;
  updatedAt: Date;
}

export const ConnectorSchema = SchemaFactory.createForClass(Connector);

// Indexes
ConnectorSchema.index({ userId: 1, connector_name: 1 }, { unique: true });
ConnectorSchema.index({ createdAt: -1 });
ConnectorSchema.index({ 'connector_creds.orange.isActive': 1 });
ConnectorSchema.index({ 'connector_creds.orange.isValid': 1 });
ConnectorSchema.index({ 'connector_creds.microsoft.isActive': 1 });
ConnectorSchema.index({ 'connector_creds.microsoft.isValid': 1 });
ConnectorSchema.index({ 'connector_creds.microsoft.expiresAt': 1 });
ConnectorSchema.index({ 'connector_creds.google.isActive': 1 });
ConnectorSchema.index({ 'connector_creds.google.isValid': 1 });
ConnectorSchema.index({ 'connector_creds.google.expiresAt': 1 });
