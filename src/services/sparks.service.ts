import { logger } from "../config/logger";
import { EngagementSnapshot, IEngagementSnapshot } from "../models/EngagementSnapshot";

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
  instagram: {
    like: 1,
    comment: 3,
    view: 0.05,
    save: 2,
    share: 4,
    follower: 25,
  },
  twitter: {
    like: 1,
    retweet: 3,
    comment: 2,
    impression: 0.01,
    follower: 20,
  },
  tiktok: {
    like: 1,
    comment: 3,
    view: 0.02,
    share: 4,
    follower: 30,
  },
  spotify: {
    stream: 0.5,
    playlist: 10,
    follower: 40,
  }
};

export interface PlatformMetrics {
  platform: string;
  totalLikes: number;
  totalDislikes?: number;
  totalComments: number;
  totalViews: number;
  totalShares?: number;
  totalSaves?: number;
  totalWatchTime?: number;
  totalImpressions?: number;
  totalReach?: number;
  followerCount?: number;
}

export interface SparksCalculationResult {
  platform: string;
  totalSparks: number;
  breakdown: {
    likes: number;
    dislikes?: number;
    comments: number;
    views: number;
    shares?: number;
    saves?: number;
    watchTime?: number;
    impressions?: number;
    followers?: number;
  };
  metrics: PlatformMetrics;
}

class SparksService {
  /**
   * Calculate Sparks for a specific platform using dummy rates
   */
  calculatePlatformSparks(metrics: PlatformMetrics): SparksCalculationResult {
    const platform = metrics.platform.toLowerCase();
    const rates = SPARKS_RATES[platform as keyof typeof SPARKS_RATES];

    if (!rates) {
      logger.warn(`No Sparks rates defined for platform: ${platform}`);
      // Default calculation for unknown platforms
      return {
        platform: metrics.platform,
        totalSparks: (metrics.totalLikes * 1) + (metrics.totalComments * 2) + (metrics.totalViews * 0.01),
        breakdown: {
          likes: metrics.totalLikes * 1,
          comments: metrics.totalComments * 2,
          views: metrics.totalViews * 0.01,
        },
        metrics
      };
    }

    const breakdown: any = {};
    let totalSparks = 0;

    // Calculate based on platform-specific rates
    if (platform === 'youtube') {
      const youtubeRates = rates as typeof SPARKS_RATES.youtube;
      breakdown.likes = (metrics.totalLikes || 0) * youtubeRates.like;
      breakdown.dislikes = (metrics.totalDislikes || 0) * youtubeRates.dislike;
      breakdown.comments = (metrics.totalComments || 0) * youtubeRates.comment;
      breakdown.views = (metrics.totalViews || 0) * youtubeRates.view;
      breakdown.watchTime = (metrics.totalWatchTime || 0) * youtubeRates.watchHour;
      breakdown.followers = (metrics.followerCount || 0) * youtubeRates.subscriber;

      totalSparks = (Object.values(breakdown) as number[]).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'instagram') {
      const instagramRates = rates as typeof SPARKS_RATES.instagram;
      breakdown.likes = (metrics.totalLikes || 0) * instagramRates.like;
      breakdown.comments = (metrics.totalComments || 0) * instagramRates.comment;
      breakdown.views = (metrics.totalViews || 0) * instagramRates.view;
      breakdown.saves = (metrics.totalSaves || 0) * instagramRates.save;
      breakdown.shares = (metrics.totalShares || 0) * instagramRates.share;
      breakdown.followers = (metrics.followerCount || 0) * instagramRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'twitter') {
      const twitterRates = rates as typeof SPARKS_RATES.twitter;
      breakdown.likes = (metrics.totalLikes || 0) * twitterRates.like;
      breakdown.comments = (metrics.totalComments || 0) * twitterRates.comment;
      breakdown.shares = (metrics.totalShares || 0) * twitterRates.retweet; // retweets
      breakdown.impressions = (metrics.totalImpressions || 0) * twitterRates.impression;
      breakdown.followers = (metrics.followerCount || 0) * twitterRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'tiktok') {
      const tiktokRates = rates as typeof SPARKS_RATES.tiktok;
      breakdown.likes = (metrics.totalLikes || 0) * tiktokRates.like;
      breakdown.comments = (metrics.totalComments || 0) * tiktokRates.comment;
      breakdown.views = (metrics.totalViews || 0) * tiktokRates.view;
      breakdown.shares = (metrics.totalShares || 0) * tiktokRates.share;
      breakdown.followers = (metrics.followerCount || 0) * tiktokRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'spotify') {
      const spotifyRates = rates as typeof SPARKS_RATES.spotify;
      breakdown.views = (metrics.totalViews || 0) * spotifyRates.stream; // streams as views
      breakdown.followers = (metrics.followerCount || 0) * spotifyRates.follower;

      totalSparks = (Object.values(breakdown) as number[]).reduce((sum: number, value: number) => sum + value, 0);
    }

    logger.info("Calculated platform Sparks:", {
      platform,
      totalSparks,
      breakdown
    });

    return {
      platform: metrics.platform,
      totalSparks: Math.round(totalSparks),
      breakdown,
      metrics
    };
  }

  /**
   * Calculate total Sparks across all platforms
   */
  calculateTotalSparks(platformResults: SparksCalculationResult[]): {
    totalSparks: number;
    platformBreakdown: SparksCalculationResult[];
    consolidatedMetrics: {
      totalLikes: number;
      totalComments: number;
      totalViews: number;
      totalFollowers: number;
      totalPosts: number;
    };
  } {
    const totalSparks = platformResults.reduce((sum, result) => sum + result.totalSparks, 0);

    const consolidatedMetrics = {
      totalLikes: platformResults.reduce((sum, r) => sum + (r.metrics.totalLikes || 0), 0),
      totalComments: platformResults.reduce((sum, r) => sum + (r.metrics.totalComments || 0), 0),
      totalViews: platformResults.reduce((sum, r) => sum + (r.metrics.totalViews || 0), 0),
      totalFollowers: platformResults.reduce((sum, r) => sum + (r.metrics.followerCount || 0), 0),
      totalPosts: platformResults.length > 0 ? platformResults.reduce((sum, r) => sum + (r.metrics as any).totalContent, 0) : 0,
    };

    logger.info("Calculated total Sparks:", {
      totalSparks,
      platformCount: platformResults.length,
      consolidatedMetrics
    });

    return {
      totalSparks: Math.round(totalSparks),
      platformBreakdown: platformResults,
      consolidatedMetrics
    };
  }

  /**
   * Get the last engagement snapshot for an account
   */
  async getLastSnapshot(userId: string, accountId: string): Promise<IEngagementSnapshot | null> {
    try {
      const snapshot = await EngagementSnapshot.findOne({
        userId,
        accountId
      }).sort({ syncedAt: -1 });

      return snapshot;
    } catch (error: any) {
      logger.error("Failed to get last snapshot:", {
        userId,
        accountId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Calculate delta between current and previous snapshot
   */
  calculateDelta(currentMetrics: PlatformMetrics, previousSnapshot: IEngagementSnapshot | null): any {
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
      likes: Math.max(0, currentMetrics.totalLikes - previousSnapshot.snapshot.totalLikes),
      dislikes: Math.max(0, (currentMetrics.totalDislikes || 0) - previousSnapshot.snapshot.totalDislikes),
      comments: Math.max(0, currentMetrics.totalComments - previousSnapshot.snapshot.totalComments),
      views: Math.max(0, currentMetrics.totalViews - previousSnapshot.snapshot.totalViews),
      shares: Math.max(0, (currentMetrics.totalShares || 0) - previousSnapshot.snapshot.totalShares),
      saves: Math.max(0, (currentMetrics.totalSaves || 0) - previousSnapshot.snapshot.totalSaves),
      watchTime: Math.max(0, (currentMetrics.totalWatchTime || 0) - previousSnapshot.snapshot.totalWatchTime),
      impressions: Math.max(0, (currentMetrics.totalImpressions || 0) - previousSnapshot.snapshot.totalImpressions),
      reach: Math.max(0, (currentMetrics.totalReach || 0) - previousSnapshot.snapshot.totalReach),
    };

    logger.info("Calculated engagement delta:", {
      accountId: previousSnapshot.accountId,
      platform: previousSnapshot.platform,
      delta,
      previousTotal: previousSnapshot.snapshot.totalLikes,
      currentTotal: currentMetrics.totalLikes
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
      return (delta.likes * 1) + (delta.comments * 2) + (delta.views * 0.01);
    }

    let totalSparks = 0;

    if (platformKey === 'youtube') {
      const youtubeRates = rates as typeof SPARKS_RATES.youtube;
      totalSparks += delta.likes * youtubeRates.like;
      totalSparks += delta.dislikes * youtubeRates.dislike;
      totalSparks += delta.comments * youtubeRates.comment;
      totalSparks += delta.views * youtubeRates.view;
      totalSparks += delta.watchTime * youtubeRates.watchHour;
    } else if (platformKey === 'instagram') {
      const instagramRates = rates as typeof SPARKS_RATES.instagram;
      totalSparks += delta.likes * instagramRates.like;
      totalSparks += delta.comments * instagramRates.comment;
      totalSparks += delta.views * instagramRates.view;
      totalSparks += delta.saves * instagramRates.save;
      totalSparks += delta.shares * instagramRates.share;
    } else if (platformKey === 'twitter') {
      const twitterRates = rates as typeof SPARKS_RATES.twitter;
      totalSparks += delta.likes * twitterRates.like;
      totalSparks += delta.comments * twitterRates.comment;
      totalSparks += delta.shares * twitterRates.retweet;
      totalSparks += delta.impressions * twitterRates.impression;
    } else if (platformKey === 'tiktok') {
      const tiktokRates = rates as typeof SPARKS_RATES.tiktok;
      totalSparks += delta.likes * tiktokRates.like;
      totalSparks += delta.comments * tiktokRates.comment;
      totalSparks += delta.views * tiktokRates.view;
      totalSparks += delta.shares * tiktokRates.share;
    } else if (platformKey === 'spotify') {
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
        contentCount
      });

      return snapshot;
    } catch (error: any) {
      logger.error("Failed to save engagement snapshot:", {
        userId,
        accountId,
        error: error.message
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

      // Update Sparks and consolidated metrics
      user.wavzProfile.sparks = totalResult.totalSparks;
      user.wavzProfile.creatorStats.totalLikes = totalResult.consolidatedMetrics.totalLikes;
      user.wavzProfile.creatorStats.totalComments = totalResult.consolidatedMetrics.totalComments;
      user.wavzProfile.creatorStats.totalViews = totalResult.consolidatedMetrics.totalViews;
      user.wavzProfile.creatorStats.followerCount = totalResult.consolidatedMetrics.totalFollowers;
      user.wavzProfile.creatorStats.totalPosts = totalResult.consolidatedMetrics.totalPosts;

      // Update platform-specific stats
      totalResult.platformBreakdown.forEach((platformResult: SparksCalculationResult) => {
        const platform = platformResult.platform.toLowerCase();
        const metrics = platformResult.metrics;

        if (platform === 'youtube') {
          user.wavzProfile.creatorStats.platformStats.youtube.likes = metrics.totalLikes || 0;
          user.wavzProfile.creatorStats.platformStats.youtube.dislikes = metrics.totalDislikes || 0;
          user.wavzProfile.creatorStats.platformStats.youtube.comments = metrics.totalComments || 0;
          user.wavzProfile.creatorStats.platformStats.youtube.views = metrics.totalViews || 0;
          user.wavzProfile.creatorStats.platformStats.youtube.watchTime = metrics.totalWatchTime || 0;
          user.wavzProfile.creatorStats.platformStats.youtube.subscribers = metrics.followerCount || 0;
        } else if (platform === 'instagram') {
          user.wavzProfile.creatorStats.platformStats.instagram.likes = metrics.totalLikes || 0;
          user.wavzProfile.creatorStats.platformStats.instagram.comments = metrics.totalComments || 0;
          user.wavzProfile.creatorStats.platformStats.instagram.views = metrics.totalViews || 0;
          user.wavzProfile.creatorStats.platformStats.instagram.saves = metrics.totalSaves || 0;
          user.wavzProfile.creatorStats.platformStats.instagram.shares = metrics.totalShares || 0;
          user.wavzProfile.creatorStats.platformStats.instagram.followers = metrics.followerCount || 0;
        } else if (platform === 'twitter') {
          user.wavzProfile.creatorStats.platformStats.twitter.likes = metrics.totalLikes || 0;
          user.wavzProfile.creatorStats.platformStats.twitter.comments = metrics.totalComments || 0;
          user.wavzProfile.creatorStats.platformStats.twitter.retweets = metrics.totalShares || 0;
          user.wavzProfile.creatorStats.platformStats.twitter.impressions = metrics.totalImpressions || 0;
          user.wavzProfile.creatorStats.platformStats.twitter.followers = metrics.followerCount || 0;
        } else if (platform === 'tiktok') {
          user.wavzProfile.creatorStats.platformStats.tiktok.likes = metrics.totalLikes || 0;
          user.wavzProfile.creatorStats.platformStats.tiktok.comments = metrics.totalComments || 0;
          user.wavzProfile.creatorStats.platformStats.tiktok.views = metrics.totalViews || 0;
          user.wavzProfile.creatorStats.platformStats.tiktok.shares = metrics.totalShares || 0;
          user.wavzProfile.creatorStats.platformStats.tiktok.followers = metrics.followerCount || 0;
        } else if (platform === 'spotify') {
          user.wavzProfile.creatorStats.platformStats.spotify.streams = metrics.totalViews || 0; // streams as views
          user.wavzProfile.creatorStats.platformStats.spotify.followers = metrics.followerCount || 0;
        }
      });

      await user.save();

      logger.info("Updated user Sparks successfully:", {
        userId,
        totalSparks: totalResult.totalSparks,
        platformCount: totalResult.platformBreakdown.length
      });

    } catch (error: any) {
      logger.error("Failed to update user Sparks:", {
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

export const sparksService = new SparksService();