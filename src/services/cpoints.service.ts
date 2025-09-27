import { CPointsHistory, ICPointsHistory, IActionableInsights } from "../models/CPointsHistory";
import { User } from "../models/User";
import { insightIQService } from "./insightiq.service";
import { logger } from "../config/logger";

interface PlatformEngagement {
  platform: string;
  accountId: string;
  contentData: any[];
}

interface CPointsCalculationResult {
  totalCPoints: number;
  qualityScore: number;
  breakdown: {
    [platform: string]: {
      cPoints: number;
      contentCount: number;
      avgEngagement: number;
    };
  };
}

class CPointsService {
  /**
   * Process raw engagement data into organized cPoints
   * This is the first step: Raw Engagement → cPoints
   */
  async processEngagementToCPoints(
    userId: string,
    fromDate?: Date,
    toDate?: Date
  ): Promise<CPointsCalculationResult> {
    try {
      logger.info("Starting cPoints processing for user:", { userId, fromDate, toDate });

      const user = await User.findById(userId);
      if (!user || !user.insightIQ?.userId) {
        throw new Error("User not found or InsightIQ not connected");
      }

      const period = {
        from: fromDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default 30 days
        to: toDate || new Date(),
      };

      // Get engagement data from all connected accounts
      const platformEngagements: PlatformEngagement[] = [];

      for (const account of user.insightIQ.connectedAccounts) {
        try {
          const contentData = await insightIQService.getContentMetrics(
            account.accountId,
            period.from.toISOString()
          );

          if (contentData?.data && Array.isArray(contentData.data)) {
            platformEngagements.push({
              platform: account.platform,
              accountId: account.accountId,
              contentData: contentData.data,
            });
          }
        } catch (error) {
          logger.warn(`Failed to get content for account ${account.accountId}:`, error);
          // Continue with other accounts
        }
      }

      // Process engagement data into cPoints
      const result = await this.calculateCPointsFromEngagement(
        userId,
        platformEngagements,
        period
      );

      // Update user's cPoints
      await User.findByIdAndUpdate(userId, {
        "wavzProfile.cPoints": result.totalCPoints,
      });

      logger.info("cPoints processing completed:", {
        userId,
        totalCPoints: result.totalCPoints,
        qualityScore: result.qualityScore,
      });

      return result;
    } catch (error) {
      logger.error("cPoints processing failed:", error);
      throw error;
    }
  }

  /**
   * Calculate cPoints from raw engagement data
   */
  private async calculateCPointsFromEngagement(
    userId: string,
    platformEngagements: PlatformEngagement[],
    period: { from: Date; to: Date }
  ): Promise<CPointsCalculationResult> {
    const rawEngagement: any[] = [];
    const breakdown: { [platform: string]: any } = {};

    // Process each platform's engagement data
    for (const platformData of platformEngagements) {
      const { platform, contentData } = platformData;
      let platformCPoints = 0;
      let totalEngagement = 0;

      for (const content of contentData) {
        const engagement = content.engagement || {};

        // Convert InsightIQ data to our format
        const contentEngagement = {
          platform: platform,
          contentId: content.id || content.external_id,
          contentType: content.content_type || "post",
          views: engagement.view_count || 0,
          likes: engagement.like_count || 0,
          dislikes: engagement.dislike_count || 0,
          comments: engagement.comment_count || 0,
          shares: engagement.share_count || 0,
          saves: engagement.save_count || 0,
          watchTime: engagement.watch_time_in_hours || 0,
          impressions: engagement.impression_organic_count || 0,
          reach: engagement.reach_organic_count || 0,
          engagementRate: this.calculateEngagementRate(engagement),
          timestamp: new Date(content.created_at || content.published_at || Date.now()),
        };

        rawEngagement.push(contentEngagement);

        // Calculate cPoints for this content
        const contentCPoints = this.calculateContentCPoints(contentEngagement);
        platformCPoints += contentCPoints;
        totalEngagement += contentEngagement.engagementRate;
      }

      breakdown[platform] = {
        cPoints: Math.round(platformCPoints),
        contentCount: contentData.length,
        avgEngagement: contentData.length > 0 ? totalEngagement / contentData.length : 0,
      };
    }

    // Calculate quality metrics
    const qualityMetrics = this.assessQualityMetrics(rawEngagement, breakdown);

    // Calculate total cPoints with quality multiplier
    const baseCPoints = Object.values(breakdown).reduce((sum: number, p: any) => sum + p.cPoints, 0);
    const qualityScore = Object.values(qualityMetrics as Record<string, number>).reduce((sum: number, score: number) => sum + score, 0) / 500; // Normalize to 0-1
    const totalCPoints = Math.round(baseCPoints * qualityScore);

    // Generate actionable insights
    const insights = this.generateActionableInsights(rawEngagement);

    // Save cPoints history
    const cPointsHistory = new CPointsHistory({
      userId,
      rawEngagement,
      qualityMetrics,
      actionableInsights: insights,
      totalCPoints,
      period,
      processedAt: new Date(),
      source: "insightiq",
    });

    await cPointsHistory.save();

    return {
      totalCPoints,
      qualityScore,
      breakdown,
    };
  }

  /**
   * Calculate cPoints for individual content
   */
  private calculateContentCPoints(engagement: any): number {
    const { platform, views, likes, comments, shares, saves = 0, watchTime = 0 } = engagement;

    // Platform-specific multipliers
    let platformMultiplier = 1;
    switch (platform.toLowerCase()) {
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

    return engagementScore * platformMultiplier;
  }

  /**
   * Calculate engagement rate from raw metrics
   */
  private calculateEngagementRate(engagement: any): number {
    const { view_count = 0, like_count = 0, comment_count = 0, share_count = 0 } = engagement;
    const totalEngagement = like_count + comment_count + share_count;
    return view_count > 0 ? (totalEngagement / view_count) * 100 : 0;
  }

  /**
   * Assess quality metrics for content
   */
  private assessQualityMetrics(rawEngagement: any[], breakdown: any): any {
    const totalContent = rawEngagement.length;

    // Simple quality assessment based on available data
    const consistency = Math.min(100, (totalContent / 30) * 100); // Posts per month
    const authenticity = 75; // Default - would need more sophisticated analysis
    const relevance = 70; // Default - would need audience analysis

    // Growth based on recent vs older content performance
    const recentContent = rawEngagement.filter(e =>
      new Date(e.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );
    const avgRecentEngagement = recentContent.length > 0
      ? recentContent.reduce((sum, e) => sum + e.engagementRate, 0) / recentContent.length
      : 0;
    const growth = Math.min(100, avgRecentEngagement * 2);

    // Interaction based on comments ratio
    const totalComments = rawEngagement.reduce((sum, e) => sum + (e.comments || 0), 0);
    const totalViews = rawEngagement.reduce((sum, e) => sum + (e.views || 0), 0);
    const interaction = totalViews > 0 ? Math.min(100, (totalComments / totalViews) * 1000) : 50;

    return {
      authenticity,
      relevance,
      consistency,
      growth,
      interaction,
    };
  }

  /**
   * Generate actionable insights from engagement data
   */
  private generateActionableInsights(rawEngagement: any[]): IActionableInsights {
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

    if (rawEngagement.length === 0) {
      insights.recommendedActions.push("Start creating content to generate insights");
      return insights;
    }

    // Analyze posting patterns
    const timeSlots: { [key: string]: number } = {};
    const contentTypes: { [key: string]: number } = {};

    rawEngagement.forEach((engagement) => {
      const hour = new Date(engagement.timestamp).getHours();
      const timeSlot = `${hour}:00-${hour + 1}:00`;
      timeSlots[timeSlot] = (timeSlots[timeSlot] || 0) + engagement.engagementRate;

      contentTypes[engagement.contentType] = (contentTypes[engagement.contentType] || 0) + 1;
    });

    // Best posting times (top 3)
    insights.bestPostingTimes = Object.entries(timeSlots)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([time]) => time);

    // Top content types
    insights.topPerformingContentTypes = Object.entries(contentTypes)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([type]) => type);

    // Generate recommendations based on performance
    const avgEngagement = rawEngagement.reduce((sum, e) => sum + e.engagementRate, 0) / rawEngagement.length;

    if (avgEngagement < 2) {
      insights.improvementAreas.push("engagement rate");
      insights.recommendedActions.push("Focus on creating more engaging content with clear calls to action");
    }

    if (rawEngagement.length < 10) {
      insights.improvementAreas.push("content volume");
      insights.recommendedActions.push("Increase posting frequency to build audience");
    }

    return insights;
  }

  /**
   * Get user's cPoints history
   */
  async getCPointsHistory(userId: string, limit: number = 10): Promise<ICPointsHistory[]> {
    return await CPointsHistory.find({ userId })
      .sort({ processedAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Get latest cPoints calculation for user
   */
  async getLatestCPoints(userId: string): Promise<ICPointsHistory | null> {
    return await CPointsHistory.findOne({ userId })
      .sort({ processedAt: -1 })
      .exec();
  }
}

export const cPointsService = new CPointsService();