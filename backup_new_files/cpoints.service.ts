import mongoose from "mongoose";
import { logger } from "../config/logger";
import { CPointsHistory, ICPointsHistory } from "../models/CPointsHistory";
import { User } from "../models/User";

export interface RawInsightIQData {
  userId: string;
  accountId: string;
  platform: string;
  periodStart: Date;
  periodEnd: Date;
  contentData: {
    totalContent: number;
    contentTypes: Record<string, number>; // e.g., {"video": 5, "post": 3}
    topPerformingContent: Array<{
      contentId: string;
      type: string;
      engagement: number;
      url?: string;
    }>;
  };
  engagementMetrics: {
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
  };
  timingData?: {
    bestPerformingHours: string[];
    consistencyScore: number;
  };
  audienceData?: {
    demographics: Record<string, any>;
    interests: string[];
    engagementPatterns: Record<string, number>;
  };
}

export interface CPointsProcessingResult {
  cPointsHistoryId: string;
  cPointsAwarded: number;
  qualityScore: number;
  insights: {
    bestContent: string[];
    recommendations: string[];
    growthAreas: string[];
  };
  processingDetails: {
    basePoints: number;
    qualityMultiplier: number;
    bonuses: number;
    finalCPoints: number;
  };
}

class CPointsService {

  /**
   * Main method: Process raw InsightIQ data into cPoints
   */
  async processEngagementData(
    rawData: RawInsightIQData,
    period: "daily" | "weekly" | "monthly" = "weekly"
  ): Promise<CPointsProcessingResult> {
    try {
      logger.info("Processing engagement data for cPoints calculation", {
        userId: rawData.userId,
        platform: rawData.platform,
        period,
        accountId: rawData.accountId
      });

      // Check for existing calculation to prevent duplicates
      const existing = await CPointsHistory.findOne({
        userId: new mongoose.Types.ObjectId(rawData.userId),
        platform: rawData.platform,
        accountId: rawData.accountId,
        periodStart: rawData.periodStart,
        periodEnd: rawData.periodEnd
      });

      if (existing && existing.status !== "pending") {
        logger.warn("CPoints already calculated for this period", {
          existingId: existing._id,
          status: existing.status
        });
        return this.formatResult(existing);
      }

      // Create raw engagement data structure
      const rawEngagement = {
        platform: rawData.platform,
        accountId: rawData.accountId,
        contentCount: rawData.contentData.totalContent,
        totalLikes: rawData.engagementMetrics.totalLikes,
        totalDislikes: rawData.engagementMetrics.totalDislikes || 0,
        totalComments: rawData.engagementMetrics.totalComments,
        totalViews: rawData.engagementMetrics.totalViews,
        totalShares: rawData.engagementMetrics.totalShares || 0,
        totalSaves: rawData.engagementMetrics.totalSaves || 0,
        totalWatchTime: rawData.engagementMetrics.totalWatchTime || 0,
        totalImpressions: rawData.engagementMetrics.totalImpressions || 0,
        totalReach: rawData.engagementMetrics.totalReach || 0,
        followerCount: rawData.engagementMetrics.followerCount || 0,
        engagementRate: rawData.engagementMetrics.engagementRate || 0,
        syncTimestamp: new Date()
      };

      // Create or update CPointsHistory record
      const cPointsHistory = existing || new CPointsHistory({
        userId: new mongoose.Types.ObjectId(rawData.userId),
        period,
        periodStart: rawData.periodStart,
        periodEnd: rawData.periodEnd,
        platform: rawData.platform,
        accountId: rawData.accountId,
        rawEngagement,
        status: "pending",
        processingVersion: "2.0.0" // Updated version for corrected flow
      });

      // Save triggers pre-save middleware that calculates cPoints
      await cPointsHistory.save();

      // Update user's cumulative cPoints
      await this.updateUserCPoints(rawData.userId, cPointsHistory.cPointsAwarded);

      logger.info("CPoints processing completed successfully", {
        userId: rawData.userId,
        cPointsAwarded: cPointsHistory.cPointsAwarded,
        historyId: cPointsHistory._id
      });

      return this.formatResult(cPointsHistory);

    } catch (error: any) {
      logger.error("Failed to process engagement data for cPoints", {
        userId: rawData.userId,
        platform: rawData.platform,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update user's cumulative cPoints and related stats
   */
  private async updateUserCPoints(userId: string, newCPoints: number): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Update cumulative cPoints
      user.wavzProfile.cPoints += newCPoints;

      // Update last activity
      user.wavzProfile.lastActivityAt = new Date();

      await user.save();

      logger.info("Updated user cPoints successfully", {
        userId,
        newCPoints,
        totalCPoints: user.wavzProfile.cPoints
      });

    } catch (error: any) {
      logger.error("Failed to update user cPoints", {
        userId,
        newCPoints,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get cPoints history for a user
   */
  async getUserCPointsHistory(
    userId: string,
    options: {
      platform?: string;
      period?: "daily" | "weekly" | "monthly";
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    history: ICPointsHistory[];
    total: number;
    summary: {
      totalCPoints: number;
      averagePerPeriod: number;
      bestPeriod: ICPointsHistory | null;
      recentTrend: "increasing" | "stable" | "decreasing";
    };
  }> {
    try {
      const filter: any = { userId: new mongoose.Types.ObjectId(userId) };

      if (options.platform) {
        filter.platform = options.platform;
      }

      if (options.period) {
        filter.period = options.period;
      }

      const limit = options.limit || 20;
      const offset = options.offset || 0;

      const [history, total] = await Promise.all([
        CPointsHistory.find(filter)
          .sort({ periodStart: -1 })
          .limit(limit)
          .skip(offset)
          .exec(),
        CPointsHistory.countDocuments(filter)
      ]);

      // Calculate summary stats
      const allHistory = await CPointsHistory.find(filter).sort({ periodStart: 1 });
      const totalCPoints = allHistory.reduce((sum, h) => sum + h.cPointsAwarded, 0);
      const averagePerPeriod = allHistory.length > 0 ? totalCPoints / allHistory.length : 0;
      const bestPeriod = allHistory.reduce((best, current) =>
        !best || current.cPointsAwarded > best.cPointsAwarded ? current : best,
        null as ICPointsHistory | null
      );

      // Calculate recent trend (last 3 periods vs previous 3)
      let recentTrend: "increasing" | "stable" | "decreasing" = "stable";
      if (allHistory.length >= 6) {
        const recent3 = allHistory.slice(-3).reduce((sum, h) => sum + h.cPointsAwarded, 0) / 3;
        const previous3 = allHistory.slice(-6, -3).reduce((sum, h) => sum + h.cPointsAwarded, 0) / 3;
        const percentChange = ((recent3 - previous3) / previous3) * 100;

        if (percentChange > 10) recentTrend = "increasing";
        else if (percentChange < -10) recentTrend = "decreasing";
      }

      return {
        history,
        total,
        summary: {
          totalCPoints,
          averagePerPeriod: Math.round(averagePerPeriod),
          bestPeriod,
          recentTrend
        }
      };

    } catch (error: any) {
      logger.error("Failed to get user cPoints history", {
        userId,
        options,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get platform performance comparison
   */
  async getPlatformComparison(
    userId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<Array<{
    platform: string;
    cPoints: number;
    efficiency: number; // cPoints per content
    engagementQuality: number;
    recommendation: string;
  }>> {
    try {
      const platformData = await CPointsHistory.find({
        userId: new mongoose.Types.ObjectId(userId),
        periodStart: { $gte: periodStart },
        periodEnd: { $lte: periodEnd }
      });

      const comparison = platformData.map(data => ({
        platform: data.platform,
        cPoints: data.cPointsAwarded,
        efficiency: data.rawEngagement.contentCount > 0 ?
          data.cPointsAwarded / data.rawEngagement.contentCount : 0,
        engagementQuality: data.processedData.engagementQuality.authenticityScore,
        recommendation: this.generatePlatformRecommendation(data)
      }));

      return comparison.sort((a, b) => b.cPoints - a.cPoints);

    } catch (error: any) {
      logger.error("Failed to get platform comparison", {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Format processing result for API response
   */
  private formatResult(cPointsHistory: ICPointsHistory): CPointsProcessingResult {
    return {
      cPointsHistoryId: cPointsHistory._id.toString(),
      cPointsAwarded: cPointsHistory.cPointsAwarded,
      qualityScore: cPointsHistory.processedData.engagementQuality.authenticityScore,
      insights: {
        bestContent: cPointsHistory.processedData.actionableInsights.contentRecommendations,
        recommendations: cPointsHistory.processedData.actionableInsights.audienceRecommendations,
        growthAreas: [
          cPointsHistory.processedData.engagementQuality.consistencyScore < 50 ? "Posting consistency" : "",
          cPointsHistory.processedData.engagementQuality.authenticityScore < 60 ? "Engagement authenticity" : "",
          cPointsHistory.rawEngagement.engagementRate < 3 ? "Overall engagement rate" : ""
        ].filter(Boolean)
      },
      processingDetails: {
        basePoints: cPointsHistory.cPointsCalculation.basePoints,
        qualityMultiplier: cPointsHistory.cPointsCalculation.qualityMultiplier,
        bonuses: cPointsHistory.cPointsCalculation.consistencyBonus + cPointsHistory.cPointsCalculation.growthBonus,
        finalCPoints: cPointsHistory.cPointsCalculation.finalCPoints
      }
    };
  }

  /**
   * Generate platform-specific recommendations
   */
  private generatePlatformRecommendation(data: ICPointsHistory): string {
    const platform = data.platform.toLowerCase();
    const quality = data.processedData.engagementQuality.authenticityScore;
    const consistency = data.processedData.engagementQuality.consistencyScore;

    if (quality < 50) {
      return `Focus on authentic engagement on ${platform}. Engage genuinely with your audience.`;
    } else if (consistency < 50) {
      return `Increase posting frequency on ${platform}. Aim for more consistent content creation.`;
    } else if (data.cPointsAwarded < 100) {
      return `Optimize content strategy on ${platform}. Consider trending topics and best posting times.`;
    } else {
      return `Great performance on ${platform}! Maintain current strategy and explore new content formats.`;
    }
  }
}

export const cPointsService = new CPointsService();