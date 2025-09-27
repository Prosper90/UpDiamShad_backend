import { Schema, model, Document } from "mongoose";

// OnChain Actions tracking for Beat value bonuses
export interface IOnChainActions {
  proofOfPost: boolean; // PoP: Posted content
  proofOfHold: boolean; // PoH: Holding crypto/NFTs
  proofOfUse: boolean; // PoU: Using platform features
  proofOfSupport: boolean; // PoS: Supporting other creators
  actionTimestamps: {
    proofOfPost?: Date;
    proofOfHold?: Date;
    proofOfUse?: Date;
    proofOfSupport?: Date;
  };
}

// Beat metadata for performance tracking
export interface IBeatMetadata {
  title?: string;
  description?: string;
  contentType: "post" | "video" | "article" | "nft" | "other";
  platform?: string;
  externalId?: string; // Reference to content on external platform
  tags: string[];
  createdAt: Date;
  isPublic: boolean;
}

// Beat performance metrics
export interface IBeatPerformance {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  engagement: number; // Calculated engagement score
  trending: boolean;
  trendingScore?: number;
  lastUpdated: Date;
}

export interface IBeat extends Document {
  beatId: string; // Unique identifier for this Beat
  userId: string; // Reference to the user who created this Beat

  // Value inheritance from Sparks
  sparksInherited: number; // Amount of Sparks-weighted cPoints inherited

  // OnChain proof system for value bonuses
  onchainActions: IOnChainActions;

  // Beat content and metadata
  metadata: IBeatMetadata;

  // Performance tracking
  performance: IBeatPerformance;

  // Final calculated value
  finalValue: number; // Base value + onchain bonuses

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  calculateValue(): number;
  updatePerformance(metrics: Partial<IBeatPerformance>): void;
  addOnChainProof(proofType: keyof IOnChainActions["actionTimestamps"]): void;
}

const OnChainActionsSchema = new Schema<IOnChainActions>({
  proofOfPost: { type: Boolean, default: false },
  proofOfHold: { type: Boolean, default: false },
  proofOfUse: { type: Boolean, default: false },
  proofOfSupport: { type: Boolean, default: false },
  actionTimestamps: {
    proofOfPost: { type: Date },
    proofOfHold: { type: Date },
    proofOfUse: { type: Date },
    proofOfSupport: { type: Date },
  },
});

const BeatMetadataSchema = new Schema<IBeatMetadata>({
  title: { type: String },
  description: { type: String },
  contentType: {
    type: String,
    required: true,
    enum: ["post", "video", "article", "nft", "other"],
    default: "post"
  },
  platform: { type: String },
  externalId: { type: String },
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  isPublic: { type: Boolean, default: true },
});

const BeatPerformanceSchema = new Schema<IBeatPerformance>({
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  engagement: { type: Number, default: 0 },
  trending: { type: Boolean, default: false },
  trendingScore: { type: Number },
  lastUpdated: { type: Date, default: Date.now },
});

const BeatSchema: Schema<IBeat> = new Schema(
  {
    beatId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    sparksInherited: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    onchainActions: {
      type: OnChainActionsSchema,
      default: () => ({
        proofOfPost: false,
        proofOfHold: false,
        proofOfUse: false,
        proofOfSupport: false,
        actionTimestamps: {},
      }),
    },
    metadata: {
      type: BeatMetadataSchema,
      required: true,
    },
    performance: {
      type: BeatPerformanceSchema,
      default: () => ({
        views: 0,
        likes: 0,
        shares: 0,
        comments: 0,
        engagement: 0,
        trending: false,
        lastUpdated: new Date(),
      }),
    },
    finalValue: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "beats",
  }
);

// Indexes for performance
BeatSchema.index({ userId: 1, createdAt: -1 });
BeatSchema.index({ "performance.trending": 1, "performance.trendingScore": -1 });
BeatSchema.index({ finalValue: -1 });
BeatSchema.index({ beatId: 1 }, { unique: true });

// Instance method to calculate Beat value with onchain bonuses
BeatSchema.methods.calculateValue = function(): number {
  let baseValue = this.sparksInherited;

  // OnChain action bonuses (10% each)
  const bonusMultiplier = 0.1;
  let totalBonus = 0;

  if (this.onchainActions.proofOfPost) totalBonus += bonusMultiplier;
  if (this.onchainActions.proofOfHold) totalBonus += bonusMultiplier;
  if (this.onchainActions.proofOfUse) totalBonus += bonusMultiplier;
  if (this.onchainActions.proofOfSupport) totalBonus += bonusMultiplier;

  // Performance bonus (up to 20% based on engagement)
  const performanceBonus = Math.min(0.2, this.performance.engagement / 1000);

  const finalValue = baseValue * (1 + totalBonus + performanceBonus);
  this.finalValue = Math.round(finalValue);

  return this.finalValue;
};

// Instance method to update performance metrics
BeatSchema.methods.updatePerformance = function(metrics: Partial<IBeatPerformance>): void {
  Object.assign(this.performance, metrics);
  this.performance.lastUpdated = new Date();

  // Recalculate engagement score
  const { views, likes, shares, comments } = this.performance;
  this.performance.engagement = (likes * 2 + shares * 3 + comments * 4) / Math.max(views, 1) * 100;

  // Update trending status
  this.performance.trending = this.performance.engagement > 50;
  if (this.performance.trending) {
    this.performance.trendingScore = this.performance.engagement;
  }

  // Recalculate final value
  this.calculateValue();
};

// Instance method to add onchain proof
BeatSchema.methods.addOnChainProof = function(proofType: keyof IOnChainActions["actionTimestamps"]): void {
  this.onchainActions[proofType] = true;
  this.onchainActions.actionTimestamps[proofType] = new Date();

  // Recalculate value with new bonus
  this.calculateValue();
};

// Static method to generate unique Beat ID
BeatSchema.statics.generateBeatId = function(): string {
  return `beat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const Beat = model<IBeat>("Beat", BeatSchema);