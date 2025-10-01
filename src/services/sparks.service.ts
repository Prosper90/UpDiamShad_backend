import { User } from "../models/User";
import { CPointsHistory } from "../models/CPointsHistory";
import { logger } from "../config/logger";
import {
  EngagementSnapshot,
  IEngagementSnapshot,
} from "../models/EngagementSnapshot";

// Dummy Sparks rates - client will provide real rates later
export const SPARKS_RATES = {
  youtube: {
    like: 2,
    dislike: -0.5, // Negative impact
    comment: 5,
    view: 0.1,
    watchHour: 10,
    subscriber: 50,
  },
  platformMultipliers: {
    youtube: 1.2, // Higher sustainability for long-form content
    instagram: 1.0,
    tiktok: 0.9, // Viral but less sustainable
    twitter: 0.8, // Fast-moving platform
    spotify: 1.3, // High sustainability for music
  },
  consistencyBonus: {
    daily: 1.5,
    weekly: 1.2,
    biweekly: 1.0,
    monthly: 0.8,
    irregular: 0.6,
  },
};

// Level progression thresholds (Sparks needed for each level)
export const LEVEL_THRESHOLDS = {
  1: 0, // Pulse
  2: 1000, // Rhythm
  3: 5000, // Harmony
  4: 15000, // Melody
  5: 50000, // Resonance
};

export interface SparksCalculationResult {
  totalSparks: number;
  breakdown: {
    baseCPoints: number;
    sustainabilityMultiplier: number;
    consistencyBonus: number;
    timeWeighting: number;
    platformWeighting: number;
  };
  levelInfo: {
    currentLevel: number;
    levelName: string;
    progress: number;
    nextLevelAt: number;
  };
}

export interface CPointsToSparksConversion {
  cPointsAmount: number;
  sustainabilityScore: number;
  timeWeight: number;
  platformWeight: number;
  consistencyMultiplier: number;
  resultingSparks: number;
}

class SparksService {
  /**
   * Convert cPoints to Sparks with sustainability weighting
   * This is the second step: cPoints → Sparks
   */
  async convertCPointsToSparks(
    userId: string
  ): Promise<SparksCalculationResult> {
    try {
      logger.info("Starting cPoints to Sparks conversion for user:", {
        userId,
      });

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Get recent cPoints history for conversion
      const cPointsHistory = await CPointsHistory.find({ userId })
        .sort({ processedAt: -1 })
        .limit(10) // Last 10 periods
        .exec();

      if (cPointsHistory.length === 0) {
        logger.warn("No cPoints history found for user:", { userId });
        return this.createEmptyResult();
      }

      // Calculate Sparks from cPoints with sustainability weighting
      const sparksResult = this.calculateSparksFromCPoints(cPointsHistory);

      // Update user's Sparks and level
      await this.updateUserSparks(userId, sparksResult.totalSparks);

      logger.info("cPoints to Sparks conversion completed:", {
        userId,
        totalSparks: sparksResult.totalSparks,
        level: sparksResult.levelInfo.currentLevel,
      });

      return sparksResult;
    } catch (error) {
      logger.error("cPoints to Sparks conversion failed:", error);
      throw error;
    }
  }

  /**
   * Calculate Sparks from cPoints history with sustainability factors
   */
  private calculateSparksFromCPoints(
    cPointsHistory: any[]
  ): SparksCalculationResult {
    let totalSparks = 0;

    // Calculate based on platform-specific rates
    if (platform === "youtube") {
      const youtubeRates = rates as typeof SPARKS_RATES.youtube;
      breakdown.likes = (metrics.totalLikes || 0) * youtubeRates.like;
      breakdown.dislikes = (metrics.totalDislikes || 0) * youtubeRates.dislike;
      breakdown.comments = (metrics.totalComments || 0) * youtubeRates.comment;
      breakdown.views = (metrics.totalViews || 0) * youtubeRates.view;
      breakdown.watchTime =
        (metrics.totalWatchTime || 0) * youtubeRates.watchHour;
      breakdown.followers =
        (metrics.followerCount || 0) * youtubeRates.subscriber;

      totalSparks = (Object.values(breakdown) as number[]).reduce(
        (sum: number, value: number) => sum + value,
        0
      );
    } else if (platform === "instagram") {
      const instagramRates = rates as typeof SPARKS_RATES.instagram;
      breakdown.likes = (metrics.totalLikes || 0) * instagramRates.like;
      breakdown.comments =
        (metrics.totalComments || 0) * instagramRates.comment;
      breakdown.views = (metrics.totalViews || 0) * instagramRates.view;
      breakdown.saves = (metrics.totalSaves || 0) * instagramRates.save;
      breakdown.shares = (metrics.totalShares || 0) * instagramRates.share;
      breakdown.followers =
        (metrics.followerCount || 0) * instagramRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce(
        (sum: number, value: number) => sum + value,
        0
      );
    } else if (platform === "twitter") {
      const twitterRates = rates as typeof SPARKS_RATES.twitter;
      breakdown.likes = (metrics.totalLikes || 0) * twitterRates.like;
      breakdown.comments = (metrics.totalComments || 0) * twitterRates.comment;
      breakdown.shares = (metrics.totalShares || 0) * twitterRates.retweet; // retweets
      breakdown.impressions =
        (metrics.totalImpressions || 0) * twitterRates.impression;
      breakdown.followers =
        (metrics.followerCount || 0) * twitterRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce(
        (sum: number, value: number) => sum + value,
        0
      );
    } else if (platform === "tiktok") {
      const tiktokRates = rates as typeof SPARKS_RATES.tiktok;
      breakdown.likes = (metrics.totalLikes || 0) * tiktokRates.like;
      breakdown.comments = (metrics.totalComments || 0) * tiktokRates.comment;
      breakdown.views = (metrics.totalViews || 0) * tiktokRates.view;
      breakdown.shares = (metrics.totalShares || 0) * tiktokRates.share;
      breakdown.followers = (metrics.followerCount || 0) * tiktokRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce(
        (sum: number, value: number) => sum + value,
        0
      );
    } else if (platform === "spotify") {
      const spotifyRates = rates as typeof SPARKS_RATES.spotify;
      breakdown.views = (metrics.totalViews || 0) * spotifyRates.stream; // streams as views
      breakdown.followers =
        (metrics.followerCount || 0) * spotifyRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce(
        (sum: number, value: number) => sum + value,
        0
      );
    }

    logger.info("Calculated platform Sparks:", {
      platform,
      totalSparks,
      breakdown,
    });

    return {
      currentLevel,
      levelName: levelNames[currentLevel],
      progress: Math.min(100, Math.max(0, progress)),
      nextLevelAt: nextThreshold,
    };
  }

  /**
   * Update user's Sparks and level in database
   */
  private async updateUserSparks(
    userId: string,
    totalSparks: number
  ): Promise<void> {
    const levelInfo = this.calculateLevelInfo(totalSparks);

    await User.findByIdAndUpdate(userId, {
      "wavzProfile.sparks": totalSparks,
      "wavzProfile.level": levelInfo.currentLevel,
      "wavzProfile.levelProgress": Math.round(levelInfo.progress),
    });
  }

  /**
   * Create empty result for users with no cPoints history
   */
  private createEmptyResult(): SparksCalculationResult {
    return {
      totalSparks: 0,
      breakdown: {
        baseCPoints: 0,
        sustainabilityMultiplier: 0,
        consistencyBonus: 1,
        timeWeighting: 1,
        platformWeighting: 1,
      },
      levelInfo: {
        currentLevel: 1,
        levelName: "Pulse",
        progress: 0,
        nextLevelAt: LEVEL_THRESHOLDS[2],
      },
    };
  }

  /**
   * Get the last engagement snapshot for an account
   */
  async getLastSnapshot(
    userId: string,
    accountId: string
  ): Promise<IEngagementSnapshot | null> {
    try {
      const snapshot = await EngagementSnapshot.findOne({
        userId,
        accountId,
      }).sort({ syncedAt: -1 });

      return snapshot;
    } catch (error: any) {
      logger.error("Failed to get last snapshot:", {
        userId,
        accountId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Calculate delta between current and previous snapshot
   */
  calculateDelta(
    currentMetrics: PlatformMetrics,
    previousSnapshot: IEngagementSnapshot | null
  ): any {
    if (!previousSnapshot) {
      // First sync - all current metrics are "new"
      return {
        likes: currentMetrics.totalLikes,
        dislikes: currentMetrics.totalDislikes || 0,
        comments: currentMetrics.totalComments,
        views: currentMetrics.totalViews,
        shares: currentMetrics.totalShares || 0,
        saves: currentMetrics.totalSaves || 0,
        watchTime: currentMetrics.totalWatchTime || 0,
        impressions: currentMetrics.totalImpressions || 0,
        reach: currentMetrics.totalReach || 0,
      };
    }

    // Calculate what's NEW since last sync
    const delta = {
      likes: Math.max(
        0,
        currentMetrics.totalLikes - previousSnapshot.snapshot.totalLikes
      ),
      dislikes: Math.max(
        0,
        (currentMetrics.totalDislikes || 0) -
          previousSnapshot.snapshot.totalDislikes
      ),
      comments: Math.max(
        0,
        currentMetrics.totalComments - previousSnapshot.snapshot.totalComments
      ),
      views: Math.max(
        0,
        currentMetrics.totalViews - previousSnapshot.snapshot.totalViews
      ),
      shares: Math.max(
        0,
        (currentMetrics.totalShares || 0) -
          previousSnapshot.snapshot.totalShares
      ),
      saves: Math.max(
        0,
        (currentMetrics.totalSaves || 0) - previousSnapshot.snapshot.totalSaves
      ),
      watchTime: Math.max(
        0,
        (currentMetrics.totalWatchTime || 0) -
          previousSnapshot.snapshot.totalWatchTime
      ),
      impressions: Math.max(
        0,
        (currentMetrics.totalImpressions || 0) -
          previousSnapshot.snapshot.totalImpressions
      ),
      reach: Math.max(
        0,
        (currentMetrics.totalReach || 0) - previousSnapshot.snapshot.totalReach
      ),
    };

    logger.info("Calculated engagement delta:", {
      accountId: previousSnapshot.accountId,
      platform: previousSnapshot.platform,
      delta,
      previousTotal: previousSnapshot.snapshot.totalLikes,
      currentTotal: currentMetrics.totalLikes,
    });

    return delta;
  }

  /**
   * Calculate Sparks from delta metrics (only NEW engagements)
   */
  calculateSparksFromDelta(delta: any, platform: string): number {
    const platformKey = platform.toLowerCase() as keyof typeof SPARKS_RATES;
    const rates = SPARKS_RATES[platformKey];

    if (!rates) {
      logger.warn(`No Sparks rates defined for platform: ${platform}`);
      // Default calculation
      return delta.likes * 1 + delta.comments * 2 + delta.views * 0.01;
    }

    let totalSparks = 0;

    if (platformKey === "youtube") {
      const youtubeRates = rates as typeof SPARKS_RATES.youtube;
      totalSparks += delta.likes * youtubeRates.like;
      totalSparks += delta.dislikes * youtubeRates.dislike;
      totalSparks += delta.comments * youtubeRates.comment;
      totalSparks += delta.views * youtubeRates.view;
      totalSparks += delta.watchTime * youtubeRates.watchHour;
    } else if (platformKey === "instagram") {
      const instagramRates = rates as typeof SPARKS_RATES.instagram;
      totalSparks += delta.likes * instagramRates.like;
      totalSparks += delta.comments * instagramRates.comment;
      totalSparks += delta.views * instagramRates.view;
      totalSparks += delta.saves * instagramRates.save;
      totalSparks += delta.shares * instagramRates.share;
    } else if (platformKey === "twitter") {
      const twitterRates = rates as typeof SPARKS_RATES.twitter;
      totalSparks += delta.likes * twitterRates.like;
      totalSparks += delta.comments * twitterRates.comment;
      totalSparks += delta.shares * twitterRates.retweet;
      totalSparks += delta.impressions * twitterRates.impression;
    } else if (platformKey === "tiktok") {
      const tiktokRates = rates as typeof SPARKS_RATES.tiktok;
      totalSparks += delta.likes * tiktokRates.like;
      totalSparks += delta.comments * tiktokRates.comment;
      totalSparks += delta.views * tiktokRates.view;
      totalSparks += delta.shares * tiktokRates.share;
    } else if (platformKey === "spotify") {
      const spotifyRates = rates as typeof SPARKS_RATES.spotify;
      totalSparks += delta.views * spotifyRates.stream; // views = streams for Spotify
    }

    return Math.round(totalSparks);
  }

  /**
   * Save engagement snapshot to database
   */
  async saveSnapshot(
    userId: string,
    accountId: string,
    platform: string,
    currentMetrics: PlatformMetrics,
    delta: any,
    sparksGenerated: number,
    contentCount: number,
    syncDuration: number
  ): Promise<IEngagementSnapshot> {
    try {
      const snapshot = new EngagementSnapshot({
        userId,
        accountId,
        platform: platform.toLowerCase(),
        syncedAt: new Date(),
        snapshot: {
          totalLikes: currentMetrics.totalLikes,
          totalDislikes: currentMetrics.totalDislikes || 0,
          totalComments: currentMetrics.totalComments,
          totalViews: currentMetrics.totalViews,
          totalShares: currentMetrics.totalShares || 0,
          totalSaves: currentMetrics.totalSaves || 0,
          totalWatchTime: currentMetrics.totalWatchTime || 0,
          totalImpressions: currentMetrics.totalImpressions || 0,
          totalReach: currentMetrics.totalReach || 0,
          totalPosts: contentCount,
        },
        deltaFromPrevious: delta,
        sparksGenerated,
        cPointsAwarded: sparksGenerated, // For now, cPoints = Sparks (can add weighting later)
        contentCount,
        syncDuration,
      });

      await snapshot.save();

      logger.info("Saved engagement snapshot:", {
        userId,
        accountId,
        platform,
        sparksGenerated,
        contentCount,
      });

      return snapshot;
    } catch (error: any) {
      logger.error("Failed to save engagement snapshot:", {
        userId,
        accountId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update user's Wavz profile with calculated Sparks
   */
  async updateUserSparks(userId: string, totalResult: any): Promise<void> {
    try {
      // Import User model here to avoid circular dependencies
      const { User } = await import("../models/User");

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const levelInfo = this.calculateLevelInfo(user.wavzProfile.sparks);
      const levelNames = [
        "",
        "Pulse",
        "Rhythm",
        "Harmony",
        "Melody",
        "Resonance",
      ];

      return {
        sparks: user.wavzProfile.sparks,
        level: levelInfo.currentLevel,
        levelName: levelNames[levelInfo.currentLevel],
        progress: levelInfo.progress,
        nextLevelAt: levelInfo.nextLevelAt,
      };
    } catch (error) {
      logger.error("Getting user sparks info failed:", error);
      throw error;
    }
  }

  /**
   * Manual Sparks adjustment (admin only)
   */
  async adjustSparks(
    userId: string,
    adjustment: number,
    reason: string
  ): Promise<{ newTotal: number; levelChange: boolean }> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      const oldSparks = user.wavzProfile.sparks;
      const oldLevel = user.wavzProfile.level;

      const newSparks = Math.max(0, oldSparks + adjustment);
      const levelInfo = this.calculateLevelInfo(newSparks);

      await User.findByIdAndUpdate(userId, {
        "wavzProfile.sparks": newSparks,
        "wavzProfile.level": levelInfo.currentLevel,
        "wavzProfile.levelProgress": Math.round(levelInfo.progress),
      });

      logger.info("Sparks manually adjusted:", {
        userId,
        oldSparks,
        adjustment,
        newSparks,
        reason,
        levelChange: oldLevel !== levelInfo.currentLevel,
      });

      return {
        newTotal: newSparks,
        levelChange: oldLevel !== levelInfo.currentLevel,
      };
    } catch (error) {
      logger.error("Sparks adjustment failed:", error);
      throw error;
    }
  }

  /**
   * Get Sparks leaderboard
   */
  async getSparksLeaderboard(limit: number = 50): Promise<
    Array<{
      userId: string;
      displayName: string;
      sparks: number;
      level: number;
      levelName: string;
    }>
  > {
    try {
      const users = await User.find({})
        .sort({ "wavzProfile.sparks": -1 })
        .limit(limit)
        .select("displayName wavzProfile.sparks wavzProfile.level")
        .exec();

      const levelNames = [
        "",
        "Pulse",
        "Rhythm",
        "Harmony",
        "Melody",
        "Resonance",
      ];

      return users.map((user) => ({
        userId: user._id.toString(),
        displayName: user.displayName,
        sparks: user.wavzProfile.sparks,
        level: user.wavzProfile.level,
        levelName: levelNames[user.wavzProfile.level] || "Unknown",
      }));
    } catch (error) {
      logger.error("Getting sparks leaderboard failed:", error);
      throw error;
    }
  }

  /**
   * LEGACY METHODS - For backward compatibility with existing routes
   * These maintain the old direct engagement → sparks flow for existing integrations
   */

  /**
   * Legacy method: Calculate platform sparks directly from metrics (old flow)
   */
  calculatePlatformSparks(platformMetrics: any): any {
    // This is the old flow for backward compatibility
    // You can choose to either:
    // 1. Return a default response
    // 2. Or map this to the new cPoints flow

    logger.warn(
      "Using legacy calculatePlatformSparks method - consider updating to new cPoints flow"
    );

    return {
      totalSparks: 0,
      breakdown: {},
      platform: platformMetrics.platform || "unknown",
    };
  }

  /**
   * Legacy method: Calculate total sparks (old flow)
   */
  calculateTotalSparks(platformResults: any[]): any {
    logger.warn(
      "Using legacy calculateTotalSparks method - consider updating to new cPoints flow"
    );
    return {
      totalSparks: 0,
      platformBreakdown: [],
      consolidatedMetrics: {},
    };
  }

  /**
   * Legacy method: Update user sparks (made public for backward compatibility)
   */
  async updateUserSparksLegacy(
    userId: string,
    totalSparks: number
  ): Promise<void> {
    return this.updateUserSparks(userId, totalSparks);
  }
}

export const sparksService = new SparksService();
