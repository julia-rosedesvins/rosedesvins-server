import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin'
}

export enum AccountStatus {
  PENDING_APPROVAL = 'pending_approval',    // Initial status after contact form submission
  APPROVED = 'approved',                    // Admin approved the account
  ACTIVE = 'active',                        // User has logged in and changed password
  SUSPENDED = 'suspended',                  // Account temporarily disabled
  REJECTED = 'rejected'                     // Admin rejected the application
}

@Schema({
  timestamps: true,
})
export class User extends Document {
  @Prop({
    type: String,
    required: true
  })
  firstName: string;

  @Prop({
    type: String,
    required: true
  })
  lastName: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true
  })
  email: string;

  @Prop({
    type: String,
    required: function() {
      return this.accountStatus !== AccountStatus.PENDING_APPROVAL;
    }
  })
  password: string;

  @Prop({
    type: String,
    enum: UserRole,
    default: UserRole.USER
  })
  role: UserRole;

  @Prop({
    type: String,
    required: true
  })
  domainName: string;

  @Prop({
    type: String,
    enum: AccountStatus,
    default: AccountStatus.PENDING_APPROVAL
  })
  accountStatus: AccountStatus;

  @Prop({
    type: Boolean,
    default: true
  })
  mustChangePassword: boolean;

  @Prop({
    type: Date,
    default: null
  })
  lastPasswordChange: Date;

  @Prop({
    type: String,
    default: null
  })
  loginToken: string;

  @Prop({
    type: Date,
    default: null
  })
  loginTokenExpires: Date;

  @Prop({
    type: Date,
    default: null
  })
  loginLinkSentAt: Date;

  @Prop({
    type: String,
    default: null
  })
  passwordResetToken: string;

  @Prop({
    type: Date,
    default: null
  })
  passwordResetExpires: Date;

  @Prop({
    type: Date,
    default: null
  })
  passwordResetRequestedAt: Date;

  @Prop({
    type: String,
    default: null
  })
  approvedBy: string;

  @Prop({
    type: Date,
    default: null
  })
  approvedAt: Date;

  @Prop({
    type: String,
    default: null
  })
  rejectionReason: string;

  @Prop({
    type: Date,
    default: null
  })
  firstLoginAt: Date;

  @Prop({
    type: Date,
    default: null
  })
  lastLoginAt: Date;

  @Prop({
    type: Number,
    default: 0
  })
  loginAttempts: number;

  @Prop({
    type: Date,
    default: null
  })
  lockedUntil: Date;

  @Prop({
    type: Date,
    default: Date.now
  })
  submittedAt: Date;

  @Prop({
    type: String,
    default: null
  })
  additionalNotes: string;

}

export const UserSchema = SchemaFactory.createForClass(User);
