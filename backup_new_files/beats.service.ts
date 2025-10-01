import mongoose from "mongoose";
import { logger } from "../config/logger";
import { Beat, IBeat } from "../models/Beat";
import { User } from "../models/User";
import { CPointsHistory } from "../models/CPointsHistory";

export interface CreateBeatInput {
  userId: string;
  cPointsHistoryId: string; // The cPoints record this Beat inherits from
  contentMetadata: {
    platform: string;
    contentId: string;
    contentType: "post" | "video" | "story" | "reel" | "tweet" | "tiktok" | "stream" | "playlist";
    contentUrl?: string;
    description?: string;
    tags?: string[];
    timestamp: Date; // When content was originally posted
  };
  engagementSnapshot: {
    likes: number;
    comments: number;
    views: number;
    shares?: number;
    saves?: number;
    watchTime?: number;
    impressions?: number;
    reach?: number;
  };
  sparksInheritance?: number; // Optional: can be calculated from cPoints if not provided
}

export interface UpdateBeatEngagementInput {
  beatId: string;
  newEngagementMetrics: {
    likes: number;
    comments: number;
    views: number;
    shares?: number;
    saves?: number;
    watchTime?: number;
    impressions?: number;
    reach?: number;
  };
}

export interface OnChainProofInput {
  beatId: string;
  proofType: "proofOfPost" | "proofOfHold" | "proofOfUse" | "proofOfSupport";
  transactionHash?: string;
  blockNumber?: number;
  verificationData?: any;
}

export interface BeatPerformanceAnalysis {
  beatId: string;
  currentValue: number;
  valueGrowth: number; // % growth since creation
  engagementGrowth: number;
  trending: boolean;
  performanceRank: number; // Rank among user's Beats
  recommendedActions: string[];
  onchainOpportunities: Array<{
    action: string;
    potentialBonus: number;
    description: string;
  }>;
}

export interface UserBeatsOverview {
  userId: string;
  totalBeats: number;
  totalBeatsValue: number;
  averageBeatValue: number;
  bestPerformingBeat: IBeat | null;
  recentBeats: IBeat[];
  trendingBeats: IBeat[];
  onchainActionsSummary: {
    proofOfPost: number;
    proofOfHold: number;
    proofOfUse: number;
    proofOfSupport: number;
    totalBonusValue: number;
  };
  platformBreakdown: Array<{
    platform: string;
    beatCount: number;
    totalValue: number;
    averageValue: number;
  }>;
  monthlyStats: {
    beatsCreated: number;
    valueGenerated: number;
    growthRate: number;
  };
}

class BeatsService {

  /**
   * Create a new Beat from a cPoints contribution
   */
  async createBeat(input: CreateBeatInput): Promise<IBeat> {
    try {
      logger.info("Creating new Beat", {
        userId: input.userId,
        platform: input.contentMetadata.platform,
        contentType: input.contentMetadata.contentType,
        cPointsHistoryId: input.cPointsHistoryId
      });

      // Validate that the cPoints history belongs to the user
      const cPointsHistory = await CPointsHistory.findOne({
        _id: new mongoose.Types.ObjectId(input.cPointsHistoryId),
        userId: new mongoose.Types.ObjectId(input.userId)
      });

      if (!cPointsHistory) {
        throw new Error("CPoints history not found or doesn't belong to user");
      }

      // Calculate Sparks inheritance from cPoints
      let sparksInherited = input.sparksInheritance;
      if (!sparksInherited) {
        // Use a portion of the cPoints as inherited Sparks value
        // This represents the sustained value from this specific content
        sparksInherited = Math.round(cPointsHistory.cPointsAwarded * 0.6); // 60% of cPoints convert to Beat value
      }

      // Check for duplicate Beat from same content
      const existingBeat = await Beat.findOne({
        userId: new mongoose.Types.ObjectId(input.userId),
        "metadata.platform": input.contentMetadata.platform,
        "metadata.contentId": input.contentMetadata.contentId
      });

      if (existingBeat) {
        logger.warn("Beat already exists for this content", {
          existingBeatId: existingBeat.beatId,
          contentId: input.contentMetadata.contentId
        });
        throw new Error("Beat already exists for this content");
      }

      // Create new Beat
      const beat = new Beat({
        userId: new mongoose.Types.ObjectId(input.userId),
        sparksInherited,
        metadata: {
          platform: input.contentMetadata.platform,
          contentId: input.contentMetadata.contentId,
          contentType: input.contentMetadata.contentType,
          engagementMetrics: input.engagementSnapshot,
          contentUrl: input.contentMetadata.contentUrl,
          description: input.contentMetadata.description,
          tags: input.contentMetadata.tags || [],
          timestamp: input.contentMetadata.timestamp
        },
        performance: {
          initialValue: sparksInherited,
          currentValue: sparksInherited,
          peakValue: sparksInherited,
          engagementGrowth: 0,
          lastCalculated: new Date(),
          trending: false
        },
        status: "active",
        verificationLevel: "basic"
      });

      // Save triggers pre-save middleware that generates beatId and calculates finalValue
      await beat.save();

      // Update user's Beat stats
      await this.updateUserBeatStats(input.userId, beat);

      logger.info("Beat created successfully", {
        beatId: beat.beatId,
        sparksInherited,
        finalValue: beat.finalValue,
        userId: input.userId
      });

      return beat;

    } catch (error: any) {
      logger.error("Failed to create Beat", {
        userId: input.userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update Beat engagement metrics (typically from periodic sync)
   */
  async updateBeatEngagement(input: UpdateBeatEngagementInput): Promise<IBeat> {
    try {
      const beat = await Beat.findOne({ beatId: input.beatId });
      if (!beat) {
        throw new Error("Beat not found");
      }

      // Use the Beat's instance method to update engagement
      await beat.updateEngagement(input.newEngagementMetrics);

      // Check if Beat should be marked as trending
      const trendingThreshold = beat.performance.initialValue * 1.5; // 50% growth
      if (beat.finalValue >= trendingThreshold && !beat.performance.trending) {
        beat.performance.trending = true;
        await beat.save();

        logger.info("Beat marked as trending", {
          beatId: beat.beatId,
          currentValue: beat.finalValue,
          initialValue: beat.performance.initialValue
        });
      }

      return beat;

    } catch (error: any) {
      logger.error("Failed to update Beat engagement", {
        beatId: input.beatId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add onchain proof to a Beat for bonus value
   */
  async addOnChainProof(input: OnChainProofInput): Promise<IBeat> {
    try {
      const beat = await Beat.findOne({ beatId: input.beatId });
      if (!beat) {
        throw new Error("Beat not found");
      }

      // Use the Beat's instance method to add onchain proof
      await beat.addOnChainProof(input.proofType);

      // Update user's proof stats
      await this.updateUserProofStats(beat.userId.toString(), input.proofType);

      logger.info("OnChain proof added to Beat", {
        beatId: beat.beatId,
        proofType: input.proofType,
        newValue: beat.finalValue,
        transactionHash: input.transactionHash
      });

      return beat;

    } catch (error: any) {
      logger.error("Failed to add onchain proof to Beat", {
        beatId: input.beatId,
        proofType: input.proofType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get comprehensive Beat performance analysis
   */
  async getBeatPerformance(beatId: string): Promise<BeatPerformanceAnalysis> {
    try {
      const beat = await Beat.findOne({ beatId });
      if (!beat) {
        throw new Error("Beat not found");
      }

      // Get user's other Beats for ranking
      const userBeats = await Beat.find({
        userId: beat.userId,
        status: "active"
      }).sort({ finalValue: -1 });

      const performanceRank = userBeats.findIndex(b => b.beatId === beatId) + 1;

      // Calculate value growth
      const valueGrowth = beat.performance.initialValue > 0 ?
        ((beat.finalValue - beat.performance.initialValue) / beat.performance.initialValue) * 100 : 0;

      // Generate recommendations
      const recommendedActions = this.generateBeatRecommendations(beat);

      // Generate onchain opportunities
      const onchainOpportunities = this.generateOnChainOpportunities(beat);

      return {
        beatId: beat.beatId,
        currentValue: beat.finalValue,
        valueGrowth: Math.round(valueGrowth * 100) / 100,
        engagementGrowth: beat.performance.engagementGrowth,
        trending: beat.performance.trending,
        performanceRank,
        recommendedActions,
        onchainOpportunities
      };

    } catch (error: any) {
      logger.error("Failed to get Beat performance", {
        beatId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's Beats overview and statistics
   */
  async getUserBeatsOverview(userId: string): Promise<UserBeatsOverview> {
    try {
      const userBeats = await Beat.find({
        userId: new mongoose.Types.ObjectId(userId)
      }).sort({ createdAt: -1 });

      const totalBeats = userBeats.length;
      const totalBeatsValue = userBeats.reduce((sum, beat) => sum + beat.finalValue, 0);
      const averageBeatValue = totalBeats > 0 ? totalBeatsValue / totalBeats : 0;

      const bestPerformingBeat = userBeats.reduce((best, current) =>
        !best || current.finalValue > best.finalValue ? current : best,
        null as IBeat | null
      );

      const recentBeats = userBeats.slice(0, 5);
      const trendingBeats = userBeats.filter(beat => beat.performance.trending);

      // Calculate onchain actions summary
      const onchainActionsSummary = {
        proofOfPost: 0,
        proofOfHold: 0,
        proofOfUse: 0,
        proofOfSupport: 0,
        totalBonusValue: 0
      };

      userBeats.forEach(beat => {
        if (beat.onchainActions.proofOfPost) onchainActionsSummary.proofOfPost++;
        if (beat.onchainActions.proofOfHold) onchainActionsSummary.proofOfHold++;
        if (beat.onchainActions.proofOfUse) onchainActionsSummary.proofOfUse++;
        if (beat.onchainActions.proofOfSupport) onchainActionsSummary.proofOfSupport++;

        // Calculate bonus value (difference between final value and inherited sparks)
        onchainActionsSummary.totalBonusValue += Math.max(0, beat.finalValue - beat.sparksInherited);
      });

      // Platform breakdown
      const platformMap = new Map<string, { count: number; totalValue: number }>();
      userBeats.forEach(beat => {
        const platform = beat.metadata.platform;
        const existing = platformMap.get(platform) || { count: 0, totalValue: 0 };
        platformMap.set(platform, {
          count: existing.count + 1,
          totalValue: existing.totalValue + beat.finalValue
        });
      });

      const platformBreakdown = Array.from(platformMap.entries()).map(([platform, data]) => ({
        platform,
        beatCount: data.count,
        totalValue: data.totalValue,
        averageValue: data.count > 0 ? data.totalValue / data.count : 0
      }));

      // Monthly stats (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentBeats30Days = userBeats.filter(beat => beat.createdAt >= thirtyDaysAgo);
      const beatsCreated = recentBeats30Days.length;
      const valueGenerated = recentBeats30Days.reduce((sum, beat) => sum + beat.finalValue, 0);

      // Calculate growth rate (compare to previous 30 days)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const previousPeriodBeats = userBeats.filter(beat =>
        beat.createdAt >= sixtyDaysAgo && beat.createdAt < thirtyDaysAgo
      );
      const previousValueGenerated = previousPeriodBeats.reduce((sum, beat) => sum + beat.finalValue, 0);
      const growthRate = previousValueGenerated > 0 ?
        ((valueGenerated - previousValueGenerated) / previousValueGenerated) * 100 :
        (valueGenerated > 0 ? 100 : 0);

      return {
        userId,
        totalBeats,
        totalBeatsValue,
        averageBeatValue: Math.round(averageBeatValue),
        bestPerformingBeat,
        recentBeats,
        trendingBeats,
        onchainActionsSummary,
        platformBreakdown,
        monthlyStats: {
          beatsCreated,
          valueGenerated,
          growthRate: Math.round(growthRate * 100) / 100
        }
      };

    } catch (error: any) {
      logger.error("Failed to get user Beats overview", {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update user's Beat-related statistics
   */
  private async updateUserBeatStats(userId: string, newBeat: IBeat): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Update Beat counts and values
      user.wavzProfile.totalBeats += 1;
      user.wavzProfile.beatsValue += newBeat.finalValue;

      // Update Beat stats
      user.wavzProfile.beatStats.totalBeats += 1;
      user.wavzProfile.beatStats.lastBeatCreated = new Date();

      // Update monthly Beats count
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);

      if (newBeat.createdAt >= thisMonth) {
        user.wavzProfile.beatStats.monthlyBeats += 1;
      }

      // Recalculate average Beat value
      if (user.wavzProfile.totalBeats > 0) {
        user.wavzProfile.beatStats.averageBeatValue =
          user.wavzProfile.beatsValue / user.wavzProfile.totalBeats;
      }

      // Update best performing Beat if this one is better
      const currentBest = await Beat.findById(user.wavzProfile.beatStats.bestPerformingBeat);
      if (!currentBest || newBeat.finalValue > currentBest.finalValue) {
        user.wavzProfile.beatStats.bestPerformingBeat = newBeat._id.toString();
      }

      await user.save();

      logger.info("Updated user Beat stats", {
        userId,
        totalBeats: user.wavzProfile.totalBeats,
        totalBeatsValue: user.wavzProfile.beatsValue,
        newBeatValue: newBeat.finalValue
      });

    } catch (error: any) {
      logger.error("Failed to update user Beat stats", {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update user's proof statistics
   */
  private async updateUserProofStats(userId: string, proofType: string): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      switch (proofType) {
        case "proofOfPost":
          user.wavzProfile.proofStats.proofOfPost += 1;
          break;
        case "proofOfHold":
          user.wavzProfile.proofStats.proofOfHold += 1;
          break;
        case "proofOfUse":
          user.wavzProfile.proofStats.proofOfUse += 1;
          break;
        case "proofOfSupport":
          user.wavzProfile.proofStats.proofOfSupport += 1;
          break;
      }

      await user.save();

    } catch (error: any) {
      logger.error("Failed to update user proof stats", {
        userId,
        proofType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate personalized recommendations for Beat improvement
   */
  private generateBeatRecommendations(beat: IBeat): string[] {
    const recommendations: string[] = [];

    // Engagement-based recommendations
    const engagement = beat.metadata.engagementMetrics;
    const totalEngagement = engagement.likes + engagement.comments + engagement.views;

    if (engagement.comments < engagement.likes * 0.1) {
      recommendations.push("Encourage more comments by asking questions in your content");
    }

    if (engagement.shares && engagement.shares < engagement.likes * 0.05) {
      recommendations.push("Create more shareable content with trending topics or valuable insights");
    }

    if (beat.performance.engagementGrowth < 10) {
      recommendations.push("Optimize posting times and use relevant hashtags for better reach");
    }

    // OnChain action recommendations
    const actions = beat.onchainActions;
    if (!actions.proofOfPost) {
      recommendations.push("Add Proof of Post to increase Beat value by 10%");
    }
    if (!actions.proofOfHold) {
      recommendations.push("Add Proof of Hold to boost Beat value by 15%");
    }
    if (!actions.proofOfUse) {
      recommendations.push("Add Proof of Use to enhance Beat value by 20%");
    }
    if (!actions.proofOfSupport) {
      recommendations.push("Add Proof of Support to maximize Beat value by 25%");
    }

    // Platform-specific recommendations
    if (beat.metadata.platform === 'youtube' && engagement.watchTime && engagement.watchTime < 2) {
      recommendations.push("Improve video retention with stronger hooks and better pacing");
    }

    return recommendations.slice(0, 5); // Limit to top 5 recommendations
  }

  /**
   * Generate onchain opportunities for Beat enhancement
   */
  private generateOnChainOpportunities(beat: IBeat): Array<{
    action: string;
    potentialBonus: number;
    description: string;
  }> {
    const opportunities = [];
    const baseValue = beat.sparksInherited;

    if (!beat.onchainActions.proofOfPost) {
      opportunities.push({
        action: "Proof of Post",
        potentialBonus: Math.round(baseValue * 0.1),
        description: "Verify content creation on-chain for 10% value boost"
      });
    }

    if (!beat.onchainActions.proofOfHold) {
      opportunities.push({
        action: "Proof of Hold",
        potentialBonus: Math.round(baseValue * 0.15),
        description: "Demonstrate token holding for 15% value increase"
      });
    }

    if (!beat.onchainActions.proofOfUse) {
      opportunities.push({
        action: "Proof of Use",
        potentialBonus: Math.round(baseValue * 0.2),
        description: "Show active platform usage for 20% value enhancement"
      });
    }

    if (!beat.onchainActions.proofOfSupport) {
      opportunities.push({
        action: "Proof of Support",
        potentialBonus: Math.round(baseValue * 0.25),
        description: "Prove community support for 25% maximum value boost"
      });
    }

    return opportunities;
  }
}

export const beatsService = new BeatsService();