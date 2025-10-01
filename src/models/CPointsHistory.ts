import { Schema, model, Document } from "mongoose";

// Raw engagement data from platforms
export interface IRawEngagement {
  platform: string;
  contentId?: string;
  contentType: string;
  views: number;
  likes: number;
  dislikes?: number;
  comments: number;
  shares: number;
  saves?: number;
  watchTime?: number; // in minutes
  impressions?: number;
  reach?: number;
  engagementRate: number;
  timestamp: Date;
}

// Quality scoring factors for engagement
export interface IQualityMetrics {
  authenticity: number; // 0-100 (real vs bot engagement)
  relevance: number; // 0-100 (content relevance to audience)
  consistency: number; // 0-100 (posting consistency)
  growth: number; // 0-100 (audience growth rate)
  interaction: number; // 0-100 (creator-audience interaction)
}

// Actionable insights generated from raw engagement
export interface IActionableInsights {
  bestPostingTimes: string[];
  topPerformingContentTypes: string[];
  audienceDemographics: {
    ageGroups: string[];
    locations: string[];
    interests: string[];
  };
  recommendedActions: string[];
  improvementAreas: string[];
}

export interface ICPointsHistory extends Document {
  userId: string;

  // Raw engagement data
  rawEngagement: IRawEngagement[];

  // Quality assessment
  qualityMetrics: IQualityMetrics;

  // Actionable insights
  actionableInsights: IActionableInsights;

  // Calculated cPoints
  totalCPoints: number;
  period: {
    from: Date;
    to: Date;
  };

  // Processing metadata
  processedAt: Date;
  source: "insightiq" | "manual" | "other";

  // Instance methods
  calculateCPoints(): number;
  generateInsights(): IActionableInsights;
}

const RawEngagementSchema = new Schema<IRawEngagement>({
  platform: { type: String, required: true },
  contentId: { type: String },
  contentType: { type: String, required: true },
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  saves: { type: Number, default: 0 },
  watchTime: { type: Number, default: 0 },
  impressions: { type: Number, default: 0 },
  reach: { type: Number, default: 0 },
  engagementRate: { type: Number, default: 0 },
  timestamp: { type: Date, required: true },
});

const QualityMetricsSchema = new Schema<IQualityMetrics>({
  authenticity: { type: Number, min: 0, max: 100, default: 50 },
  relevance: { type: Number, min: 0, max: 100, default: 50 },
  consistency: { type: Number, min: 0, max: 100, default: 50 },
  growth: { type: Number, min: 0, max: 100, default: 50 },
  interaction: { type: Number, min: 0, max: 100, default: 50 },
});

const ActionableInsightsSchema = new Schema<IActionableInsights>({
  bestPostingTimes: [{ type: String }],
  topPerformingContentTypes: [{ type: String }],
  audienceDemographics: {
    ageGroups: [{ type: String }],
    locations: [{ type: String }],
    interests: [{ type: String }],
  },
  recommendedActions: [{ type: String }],
  improvementAreas: [{ type: String }],
});

const CPointsHistorySchema: Schema<ICPointsHistory> = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    rawEngagement: {
      type: [RawEngagementSchema],
      default: [],
    },
    qualityMetrics: {
      type: QualityMetricsSchema,
      default: () => ({
        authenticity: 50,
        relevance: 50,
        consistency: 50,
        growth: 50,
        interaction: 50,
      }),
    },
    actionableInsights: {
      type: ActionableInsightsSchema,
      default: () => ({
        bestPostingTimes: [],
        topPerformingContentTypes: [],
        audienceDemographics: {
          ageGroups: [],
          locations: [],
          interests: [],
        },
        recommendedActions: [],
        improvementAreas: [],
      }),
    },
    totalCPoints: {
      type: Number,
      default: 0,
      min: 0,
    },
    period: {
      from: { type: Date, required: true },
      to: { type: Date, required: true },
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ["insightiq", "manual", "other"],
      default: "insightiq",
    },
  },
  {
    timestamps: true,
    collection: "cpoints_history",
  }
);

// Indexes for performance
CPointsHistorySchema.index({ userId: 1, "period.from": -1 });
CPointsHistorySchema.index({ userId: 1, processedAt: -1 });
CPointsHistorySchema.index({ totalCPoints: -1 });

// Instance method to calculate cPoints from raw engagement
CPointsHistorySchema.methods.calculateCPoints = function(): number {
  if (!this.rawEngagement || this.rawEngagement.length === 0) {
    this.totalCPoints = 0;
    return 0;
  }

  let baseCPoints = 0;

  // Calculate base points from engagement
  this.rawEngagement.forEach((engagement: IRawEngagement) => {
    const { views, likes, comments, shares, saves = 0, watchTime = 0 } = engagement;

    // Platform-specific scoring
    let platformMultiplier = 1;
    switch (engagement.platform.toLowerCase()) {
      case "youtube":
        platformMultiplier = 1.2; // Higher value for long-form content
        break;
      case "tiktok":
        platformMultiplier = 1.0;
        break;
      case "instagram":
        platformMultiplier = 1.1;
        break;
      case "twitter":
        platformMultiplier = 0.9; // Lower barrier to entry
        break;
      default:
        platformMultiplier = 1.0;
    }

    // Weighted scoring system
    const engagementScore =
      (views * 0.1) +
      (likes * 1) +
      (comments * 2) +
      (shares * 3) +
      (saves * 2) +
      (watchTime * 0.5);

    baseCPoints += engagementScore * platformMultiplier;
  });

  // Apply quality multipliers
  const qualityScore = (
    this.qualityMetrics.authenticity +
    this.qualityMetrics.relevance +
    this.qualityMetrics.consistency +
    this.qualityMetrics.growth +
    this.qualityMetrics.interaction
  ) / 500; // Normalize to 0-1

  // Final cPoints calculation
  this.totalCPoints = Math.round(baseCPoints * qualityScore);
  return this.totalCPoints;
};

// Instance method to generate actionable insights
CPointsHistorySchema.methods.generateInsights = function(): IActionableInsights {
  const insights: IActionableInsights = {
    bestPostingTimes: [],
    topPerformingContentTypes: [],
    audienceDemographics: {
      ageGroups: [],
      locations: [],
      interests: [],
    },
    recommendedActions: [],
    improvementAreas: [],
  };

  if (!this.rawEngagement || this.rawEngagement.length === 0) {
    insights.recommendedActions.push("Start creating content to generate insights");
    this.actionableInsights = insights;
    return insights;
  }

  // Analyze posting patterns
  const timeSlots: { [key: string]: number } = {};
  const contentTypes: { [key: string]: number } = {};

  this.rawEngagement.forEach((engagement: IRawEngagement) => {
    const hour = engagement.timestamp.getHours();
    const timeSlot = `${hour}:00-${hour + 1}:00`;
    timeSlots[timeSlot] = (timeSlots[timeSlot] || 0) + engagement.engagementRate;

    contentTypes[engagement.contentType] = (contentTypes[engagement.contentType] || 0) + 1;
  });

  // Best posting times (top 3)
  insights.bestPostingTimes = Object.entries(timeSlots)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([time]) => time);

  // Top content types
  insights.topPerformingContentTypes = Object.entries(contentTypes)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 3)
    .map(([type]) => type);

  // Generate recommendations based on quality metrics
  if (this.qualityMetrics.consistency < 50) {
    insights.improvementAreas.push("posting consistency");
    insights.recommendedActions.push("Create a content calendar for regular posting");
  }

  if (this.qualityMetrics.interaction < 50) {
    insights.improvementAreas.push("audience interaction");
    insights.recommendedActions.push("Respond to comments and engage with your audience");
  }

  if (this.qualityMetrics.growth < 50) {
    insights.improvementAreas.push("audience growth");
    insights.recommendedActions.push("Use trending hashtags and collaborate with others");
  }

  this.actionableInsights = insights;
  return insights;
};

export const CPointsHistory = model<ICPointsHistory>("CPointsHistory", CPointsHistorySchema);