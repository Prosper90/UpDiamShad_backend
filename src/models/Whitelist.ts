import mongoose, { Document, Schema } from 'mongoose';

export interface IWhitelistEntry extends Document {
  wallet_address: string;
  email: string;
  reason?: string;
  twitter?: string;
  discord?: string;
  is_kyc_verified: boolean;
  submitted_at: Date;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date;
  updated_at: Date;
  
  // Veriff Integration Fields
  veriff_session_id?: string;
  veriff_status?: 'created' | 'started' | 'submitted' | 'approved' | 'declined' | 'expired' | 'abandoned';
  veriff_decision?: string;
  veriff_reason?: string;
  veriff_completed_at?: Date;
  veriff_session_url?: string;
  veriff_person_id?: string;
}

const WhitelistSchema = new Schema<IWhitelistEntry>({
  wallet_address: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^0x[a-fA-F0-9]{40}$/
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 500
  },
  twitter: {
    type: String,
    trim: true,
    maxlength: 50
  },
  discord: {
    type: String,
    trim: true,
    maxlength: 50
  },
  is_kyc_verified: {
    type: Boolean,
    default: false
  },
  submitted_at: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  
  // Veriff Integration Fields
  veriff_session_id: {
    type: String,
    sparse: true,
    index: true
  },
  veriff_status: {
    type: String,
    enum: ['created', 'started', 'submitted', 'approved', 'declined', 'expired', 'abandoned'],
    default: undefined
  },
  veriff_decision: {
    type: String,
    default: undefined
  },
  veriff_reason: {
    type: String,
    default: undefined
  },
  veriff_completed_at: {
    type: Date,
    default: undefined
  },
  veriff_session_url: {
    type: String,
    default: undefined
  },
  veriff_person_id: {
    type: String,
    default: undefined
  }
});

// Indexes for better performance
// Note: wallet_address already has unique index from schema definition
WhitelistSchema.index({ email: 1 });
WhitelistSchema.index({ status: 1 });
WhitelistSchema.index({ submitted_at: -1 });

// Update the updated_at field before saving
WhitelistSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

export const Whitelist = mongoose.model<IWhitelistEntry>('Whitelist', WhitelistSchema);