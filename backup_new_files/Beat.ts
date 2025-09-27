import mongoose, { Document, Schema } from "mongoose";

// OnChain Actions interface
export interface IOnChainActions {
  proofOfPost: boolean;
  proofOfHold: boolean;
  proofOfUse: boolean;
  proofOfSupport: boolean;
  lastUpdated: Date;
}

// Beat metadata interface
export interface IBeatMetadata {
  platform: string;
  contentId: string; // Platform-specific content ID
  contentType: "post" | "video" | "story" | "reel" | "tweet" | "tiktok" | "stream" | "playlist";
  engagementMetrics: {
    likes: number;
    comments: number;
    views: number;
    shares?: number;
    saves?: number;
    watchTime?: number; // in hours for videos
    impressions?: number;
    reach?: number;
  };
  contentUrl?: string;
  description?: string;
  tags?: string[];
  timestamp: Date; // When content was originally posted
}

// Beat performance tracking
export interface IBeatPerformance {
  initialValue: number; // Value when Beat was created
  currentValue: number; // Current calculated value
  peakValue: number; // Highest value achieved
  engagementGrowth: number; // % growth since creation
  lastCalculated: Date;
  trending: boolean; // Is this Beat currently trending
}

// Main Beat interface
export interface IBeat extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  beatId: string; // Unique identifier for this Beat

  // Core Beat composition
  sparksInherited: number; // Sparks-weighted cPoints value from this content
  onchainActions: IOnChainActions;

  // Content metadata
  metadata: IBeatMetadata;

  // Value calculation
  finalValue: number; // Calculated Beat value (sparks + onchain bonuses)
  performance: IBeatPerformance;

  // Status tracking
  status: "active" | "archived" | "disputed" | "verified";
  verificationLevel: "basic" | "enhanced" | "premium";

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastSyncAt?: Date; // Last time engagement data was synced

  // Instance methods
  calculateValue(): number;
  updateEngagement(newMetrics: any): Promise<void>;
  addOnChainProof(proofType: keyof IOnChainActions): Promise<void>;
}

const BeatSchema: Schema<IBeat> = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    beatId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Core Beat composition
    sparksInherited: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    onchainActions: {
      proofOfPost: {
        type: Boolean,
        default: false,
      },
      proofOfHold: {
        type: Boolean,
        default: false,
      },
      proofOfUse: {
        type: Boolean,
        default: false,
      },
      proofOfSupport: {
        type: Boolean,
        default: false,
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
    },

    // Content metadata
    metadata: {
      platform: {
        type: String,
        required: true,
        enum: ["youtube", "instagram", "twitter", "tiktok", "spotify", "twitch"],
        index: true,
      },
      contentId: {
        type: String,
        required: true,
        index: true,
      },
      contentType: {
        type: String,
        required: true,
        enum: ["post", "video", "story", "reel", "tweet", "tiktok", "stream", "playlist"],
      },
      engagementMetrics: {
        likes: { type: Number, default: 0 },
        comments: { type: Number, default: 0 },
        views: { type: Number, default: 0 },
        shares: { type: Number, default: 0 },
        saves: { type: Number, default: 0 },
        watchTime: { type: Number, default: 0 },
        impressions: { type: Number, default: 0 },
        reach: { type: Number, default: 0 },
      },
      contentUrl: String,
      description: String,
      tags: [String],
      timestamp: {
        type: Date,
        required: true,
        index: true,
      },
    },

    // Value calculation
    finalValue: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      index: true,
    },

    performance: {
      initialValue: {
        type: Number,
        required: true,
        default: 0,
      },
      currentValue: {
        type: Number,
        required: true,
        default: 0,
      },
      peakValue: {
        type: Number,
        required: true,
        default: 0,
      },
      engagementGrowth: {
        type: Number,
        default: 0,
      },
      lastCalculated: {
        type: Date,
        default: Date.now,
      },
      trending: {
        type: Boolean,
        default: false,
        index: true,
      },
    },

    // Status tracking
    status: {
      type: String,
      enum: ["active", "archived", "disputed", "verified"],
      default: "active",
      index: true,
    },

    verificationLevel: {
      type: String,
      enum: ["basic", "enhanced", "premium"],
      default: "basic",
    },

    lastSyncAt: Date,
  },
  {
    timestamps: true,
  }
);

// Compound indexes for performance
BeatSchema.index({ userId: 1, createdAt: -1 });
BeatSchema.index({ userId: 1, finalValue: -1 });
BeatSchema.index({ "metadata.platform": 1, createdAt: -1 });
BeatSchema.index({ status: 1, "performance.trending": 1 });
BeatSchema.index({ createdAt: -1, finalValue: -1 }); // For leaderboards

// Instance method to calculate Beat value
BeatSchema.methods.calculateValue = function(): number {
  let baseValue = this.sparksInherited;

  // OnChain action bonuses (client will provide exact multipliers later)
  const onchainBonus = {
    proofOfPost: this.onchainActions.proofOfPost ? baseValue * 0.1 : 0,
    proofOfHold: this.onchainActions.proofOfHold ? baseValue * 0.15 : 0,
    proofOfUse: this.onchainActions.proofOfUse ? baseValue * 0.2 : 0,
    proofOfSupport: this.onchainActions.proofOfSupport ? baseValue * 0.25 : 0,
  };

  const totalOnchainBonus = Object.values(onchainBonus).reduce((sum, bonus) => sum + bonus, 0);
  const calculatedValue = baseValue + totalOnchainBonus;

  // Update performance tracking
  this.performance.currentValue = calculatedValue;
  if (calculatedValue > this.performance.peakValue) {
    this.performance.peakValue = calculatedValue;
  }
  this.performance.lastCalculated = new Date();

  return Math.round(calculatedValue);
};

// Instance method to update engagement metrics
BeatSchema.methods.updateEngagement = async function(newMetrics: any): Promise<void> {
  const oldMetrics = this.metadata.engagementMetrics;

  // Update engagement metrics
  this.metadata.engagementMetrics = {
    ...oldMetrics,
    ...newMetrics,
  };

  // Calculate engagement growth
  const oldTotal = oldMetrics.likes + oldMetrics.comments + oldMetrics.views;
  const newTotal = this.metadata.engagementMetrics.likes +
                   this.metadata.engagementMetrics.comments +
                   this.metadata.engagementMetrics.views;

  if (oldTotal > 0) {
    this.performance.engagementGrowth = ((newTotal - oldTotal) / oldTotal) * 100;
  }

  // Recalculate value (sparks may have changed with new engagement)
  this.finalValue = this.calculateValue();
  this.lastSyncAt = new Date();

  await this.save();
};

// Instance method to add onchain proof
BeatSchema.methods.addOnChainProof = async function(proofType: keyof IOnChainActions): Promise<void> {
  if (proofType === 'lastUpdated') return; // Skip lastUpdated field

  this.onchainActions[proofType] = true;
  this.onchainActions.lastUpdated = new Date();

  // Recalculate value with new onchain bonus
  this.finalValue = this.calculateValue();

  await this.save();
};

// Generate unique Beat ID before saving
BeatSchema.pre<IBeat>("save", function (next) {
  if (!this.beatId) {
    // Format: BEAT_PLATFORM_USERID_TIMESTAMP
    const timestamp = Date.now().toString(36);
    const userIdShort = this.userId.toString().slice(-6);
    this.beatId = `BEAT_${this.metadata.platform.toUpperCase()}_${userIdShort}_${timestamp}`;
  }

  // Ensure finalValue is calculated
  if (this.isNew || this.isModified(['sparksInherited', 'onchainActions'])) {
    this.finalValue = this.calculateValue();
  }

  next();
});

// Transform output to include calculated fields
BeatSchema.methods.toJSON = function() {
  const beatObject = this.toObject();

  // Add calculated fields for API responses
  beatObject.onchainActionCount = Object.values(this.onchainActions)
    .filter((value, index) => index < 4) // Exclude lastUpdated
    .filter(Boolean).length;

  beatObject.engagementScore =
    this.metadata.engagementMetrics.likes +
    (this.metadata.engagementMetrics.comments * 2) +
    (this.metadata.engagementMetrics.views * 0.1);

  return beatObject;
};

export const Beat = mongoose.model<IBeat>("Beat", BeatSchema);