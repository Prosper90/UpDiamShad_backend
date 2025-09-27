import mongoose, { Document, Schema } from "mongoose";

// Raw engagement data from InsightIQ
export interface IRawEngagementData {
  platform: string;
  accountId: string;
  contentCount: number;
  totalLikes: number;
  totalDislikes?: number;
  totalComments: number;
  totalViews: number;
  totalShares?: number;
  totalSaves?: number;
  totalWatchTime?: number; // in hours
  totalImpressions?: number;
  totalReach?: number;
  followerCount?: number;
  engagementRate?: number;
  syncTimestamp: Date;
}

// Processed actionable data organized from raw engagement
export interface IProcessedData {
  // Content organization metrics
  contentCategories: {
    [contentType: string]: {
      count: number;
      avgEngagement: number;
      topPerforming: string[]; // content IDs
    };
  };

  // Engagement quality metrics
  engagementQuality: {
    authenticityScore: number; // 0-100 (based on engagement patterns)
    consistencyScore: number; // 0-100 (posting consistency)
    growthTrend: "increasing" | "stable" | "decreasing";
    viralContent: number; // count of viral content pieces
  };

  // Actionable insights
  actionableInsights: {
    bestPostingTimes: string[];
    topHashtags: string[];
    audienceRecommendations: string[];
    contentRecommendations: string[];
  };

  // Performance compared to previous period
  periodComparison: {
    previousPeriod: string;
    growthMetrics: {
      likesGrowth: number;
      commentsGrowth: number;
      viewsGrowth: number;
      followerGrowth: number;
    };
  };
}

// cPoints calculation breakdown
export interface ICPointsCalculation {
  basePoints: number; // Raw engagement converted to base points
  qualityMultiplier: number; // Based on engagement quality
  consistencyBonus: number; // Bonus for consistent posting
  growthBonus: number; // Bonus for growth metrics
  platformWeight: number; // Platform-specific weighting
  finalCPoints: number; // Total cPoints awarded
  calculationFormula: string; // For transparency/debugging
}

// Main CPointsHistory interface
export interface ICPointsHistory extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;

  // Period tracking
  period: "daily" | "weekly" | "monthly";
  periodStart: Date;
  periodEnd: Date;
  calculationDate: Date;

  // Platform data
  platform: string;
  accountId: string; // InsightIQ account ID

  // Core data
  rawEngagement: IRawEngagementData;
  processedData: IProcessedData;
  cPointsCalculation: ICPointsCalculation;

  // Results
  cPointsAwarded: number;
  cumulativeCPoints: number; // Running total for user

  // Metadata
  status: "pending" | "processed" | "verified" | "disputed";
  processingVersion: string; // For algorithm versioning
  notes?: string; // Any special notes about this calculation

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  calculateCPoints(): ICPointsCalculation;
  organizeEngagementData(): IProcessedData;
}

const CPointsHistorySchema: Schema<ICPointsHistory> = new Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Period tracking
    period: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      required: true,
      index: true,
    },
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    periodEnd: {
      type: Date,
      required: true,
      index: true,
    },
    calculationDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Platform data
    platform: {
      type: String,
      required: true,
      enum: ["youtube", "instagram", "twitter", "tiktok", "spotify", "twitch"],
      index: true,
    },
    accountId: {
      type: String,
      required: true,
      index: true,
    },

    // Raw engagement data from InsightIQ
    rawEngagement: {
      platform: { type: String, required: true },
      accountId: { type: String, required: true },
      contentCount: { type: Number, default: 0 },
      totalLikes: { type: Number, default: 0 },
      totalDislikes: { type: Number, default: 0 },
      totalComments: { type: Number, default: 0 },
      totalViews: { type: Number, default: 0 },
      totalShares: { type: Number, default: 0 },
      totalSaves: { type: Number, default: 0 },
      totalWatchTime: { type: Number, default: 0 },
      totalImpressions: { type: Number, default: 0 },
      totalReach: { type: Number, default: 0 },
      followerCount: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 },
      syncTimestamp: { type: Date, required: true },
    },

    // Processed actionable data
    processedData: {
      contentCategories: {
        type: Map,
        of: {
          count: { type: Number, default: 0 },
          avgEngagement: { type: Number, default: 0 },
          topPerforming: [String],
        },
        default: {},
      },

      engagementQuality: {
        authenticityScore: { type: Number, min: 0, max: 100, default: 50 },
        consistencyScore: { type: Number, min: 0, max: 100, default: 50 },
        growthTrend: {
          type: String,
          enum: ["increasing", "stable", "decreasing"],
          default: "stable",
        },
        viralContent: { type: Number, default: 0 },
      },

      actionableInsights: {
        bestPostingTimes: [String],
        topHashtags: [String],
        audienceRecommendations: [String],
        contentRecommendations: [String],
      },

      periodComparison: {
        previousPeriod: String,
        growthMetrics: {
          likesGrowth: { type: Number, default: 0 },
          commentsGrowth: { type: Number, default: 0 },
          viewsGrowth: { type: Number, default: 0 },
          followerGrowth: { type: Number, default: 0 },
        },
      },
    },

    // cPoints calculation details
    cPointsCalculation: {
      basePoints: { type: Number, required: true, default: 0 },
      qualityMultiplier: { type: Number, required: true, default: 1 },
      consistencyBonus: { type: Number, required: true, default: 0 },
      growthBonus: { type: Number, required: true, default: 0 },
      platformWeight: { type: Number, required: true, default: 1 },
      finalCPoints: { type: Number, required: true, default: 0 },
      calculationFormula: { type: String, required: true },
    },

    // Results
    cPointsAwarded: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      index: true,
    },
    cumulativeCPoints: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },

    // Metadata
    status: {
      type: String,
      enum: ["pending", "processed", "verified", "disputed"],
      default: "pending",
      index: true,
    },
    processingVersion: {
      type: String,
      required: true,
      default: "1.0.0",
    },
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Compound indexes for performance
CPointsHistorySchema.index({ userId: 1, periodStart: -1 });
CPointsHistorySchema.index({ userId: 1, platform: 1, periodStart: -1 });
CPointsHistorySchema.index({ platform: 1, calculationDate: -1 });
CPointsHistorySchema.index({ period: 1, status: 1, calculationDate: -1 });

// Unique constraint to prevent duplicate calculations
CPointsHistorySchema.index(
  { userId: 1, platform: 1, accountId: 1, periodStart: 1, periodEnd: 1 },
  { unique: true }
);

// Instance method to organize raw engagement into actionable data
CPointsHistorySchema.methods.organizeEngagementData = function(): IProcessedData {
  const raw = this.rawEngagement;

  // Calculate engagement quality score
  const totalEngagement = raw.totalLikes + raw.totalComments + raw.totalViews;
  const avgEngagementPerContent = raw.contentCount > 0 ? totalEngagement / raw.contentCount : 0;
  const engagementRate = raw.followerCount > 0 ? (totalEngagement / raw.followerCount) * 100 : 0;

  // Authenticity score based on engagement patterns
  const authenticityScore = Math.min(100, Math.max(0,
    50 + (engagementRate > 5 ? 25 : engagementRate * 5) - (engagementRate > 15 ? 25 : 0)
  ));

  // Consistency score based on content frequency
  const consistencyScore = Math.min(100, raw.contentCount * 10); // 10 points per content piece, max 100

  // Growth trend (simplified - will be enhanced with historical data)
  const growthTrend = raw.engagementRate > 5 ? "increasing" :
                      raw.engagementRate > 2 ? "stable" : "decreasing";

  return {
    contentCategories: {
      // Will be populated when we have content type data from InsightIQ
    },

    engagementQuality: {
      authenticityScore,
      consistencyScore,
      growthTrend,
      viralContent: 0, // Will be calculated based on content performance thresholds
    },

    actionableInsights: {
      bestPostingTimes: [], // Will be populated from content timestamps
      topHashtags: [], // Will be extracted from content analysis
      audienceRecommendations: [],
      contentRecommendations: [],
    },

    periodComparison: {
      previousPeriod: "N/A", // Will be populated when comparing with historical data
      growthMetrics: {
        likesGrowth: 0,
        commentsGrowth: 0,
        viewsGrowth: 0,
        followerGrowth: 0,
      },
    },
  };
};

// Instance method to calculate cPoints from organized data
CPointsHistorySchema.methods.calculateCPoints = function(): ICPointsCalculation {
  const raw = this.rawEngagement;
  const processed = this.processedData;

  // Base points calculation (similar to current sparks calculation)
  const basePoints =
    (raw.totalLikes * 1) +
    (raw.totalComments * 3) +
    (raw.totalViews * 0.01) +
    ((raw.totalShares || 0) * 2) +
    ((raw.totalSaves || 0) * 1.5) +
    ((raw.followerCount || 0) * 0.1);

  // Quality multiplier based on engagement authenticity
  const qualityMultiplier = processed.engagementQuality.authenticityScore / 100;

  // Consistency bonus
  const consistencyBonus = (processed.engagementQuality.consistencyScore / 100) * basePoints * 0.1;

  // Growth bonus
  const growthBonus = processed.engagementQuality.growthTrend === "increasing" ? basePoints * 0.2 : 0;

  // Platform-specific weighting (will be provided by client)
  const platformWeights: Record<string, number> = {
    youtube: 1.2,
    instagram: 1.0,
    twitter: 0.8,
    tiktok: 1.1,
    spotify: 1.3,
    twitch: 1.0,
  };
  const platformWeight = platformWeights[raw.platform] || 1.0;

  // Final calculation
  const finalCPoints = Math.round(
    (basePoints * qualityMultiplier * platformWeight) + consistencyBonus + growthBonus
  );

  const calculationFormula =
    `(${basePoints.toFixed(2)} * ${qualityMultiplier.toFixed(2)} * ${platformWeight}) + ${consistencyBonus.toFixed(2)} + ${growthBonus.toFixed(2)} = ${finalCPoints}`;

  return {
    basePoints: Math.round(basePoints),
    qualityMultiplier,
    consistencyBonus: Math.round(consistencyBonus),
    growthBonus: Math.round(growthBonus),
    platformWeight,
    finalCPoints,
    calculationFormula,
  };
};

// Pre-save middleware to calculate cPoints
CPointsHistorySchema.pre<ICPointsHistory>("save", function (next) {
  if (this.isNew || this.isModified('rawEngagement')) {
    // Organize raw data into processed insights
    this.processedData = this.organizeEngagementData();

    // Calculate cPoints
    this.cPointsCalculation = this.calculateCPoints();
    this.cPointsAwarded = this.cPointsCalculation.finalCPoints;

    // Mark as processed
    this.status = "processed";
  }

  next();
});

// Transform output for API responses
CPointsHistorySchema.methods.toJSON = function() {
  const historyObject = this.toObject();

  // Add helpful calculated fields
  historyObject.efficiency = this.rawEngagement.contentCount > 0 ?
    this.cPointsAwarded / this.rawEngagement.contentCount : 0;

  historyObject.periodDuration = Math.ceil(
    (this.periodEnd.getTime() - this.periodStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  return historyObject;
};

export const CPointsHistory = mongoose.model<ICPointsHistory>("CPointsHistory", CPointsHistorySchema);