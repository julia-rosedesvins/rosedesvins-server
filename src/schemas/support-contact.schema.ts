import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { User } from './user.schema';

@Schema({ 
  timestamps: true,
  collection: 'support-contacts' 
})
export class SupportContact extends Document {
  @Prop({ 
    type: Types.ObjectId, 
    ref: User.name, 
    required: true,
    index: true 
  })
  userId: Types.ObjectId;

  @Prop({ 
    required: true, 
    trim: true,
    minlength: 3,
    maxlength: 200 
  })
  subject: string;

  @Prop({ 
    required: true, 
    trim: true,
    minlength: 10,
    maxlength: 2000 
  })
  message: string;

  @Prop({ 
    required: true,
    enum: [
      'pending',       // New support request, awaiting review
      'in_progress',   // Support team is working on it
      'resolved',      // Issue has been resolved
      'closed'         // Request is closed (resolved or dismissed)
    ],
    default: 'pending',
    lowercase: true,
    index: true
  })
  status: string;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const SupportContactSchema = SchemaFactory.createForClass(SupportContact);

// Create indexes for better performance
SupportContactSchema.index({ userId: 1, createdAt: -1 }); // Query support requests by user, sorted by date
SupportContactSchema.index({ status: 1, createdAt: -1 }); // Query by status, sorted by date
SupportContactSchema.index({ createdAt: -1 }); // Sort by creation date
