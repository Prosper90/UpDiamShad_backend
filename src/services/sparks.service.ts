import { logger } from "../config/logger";

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
      breakdown.likes = (metrics.totalLikes || 0) * rates.like;
      breakdown.dislikes = (metrics.totalDislikes || 0) * rates.dislike;
      breakdown.comments = (metrics.totalComments || 0) * rates.comment;
      breakdown.views = (metrics.totalViews || 0) * rates.view;
      breakdown.watchTime = (metrics.totalWatchTime || 0) * rates.watchHour;
      breakdown.followers = (metrics.followerCount || 0) * rates.subscriber;

      totalSparks = Object.values(breakdown).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'instagram') {
      breakdown.likes = (metrics.totalLikes || 0) * rates.like;
      breakdown.comments = (metrics.totalComments || 0) * rates.comment;
      breakdown.views = (metrics.totalViews || 0) * rates.view;
      breakdown.saves = (metrics.totalSaves || 0) * rates.save;
      breakdown.shares = (metrics.totalShares || 0) * rates.share;
      breakdown.followers = (metrics.followerCount || 0) * rates.follower;

      totalSparks = Object.values(breakdown).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'twitter') {
      breakdown.likes = (metrics.totalLikes || 0) * rates.like;
      breakdown.comments = (metrics.totalComments || 0) * rates.comment;
      breakdown.shares = (metrics.totalShares || 0) * rates.retweet; // retweets
      breakdown.impressions = (metrics.totalImpressions || 0) * rates.impression;
      breakdown.followers = (metrics.followerCount || 0) * rates.follower;

      totalSparks = Object.values(breakdown).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'tiktok') {
      breakdown.likes = (metrics.totalLikes || 0) * rates.like;
      breakdown.comments = (metrics.totalComments || 0) * rates.comment;
      breakdown.views = (metrics.totalViews || 0) * rates.view;
      breakdown.shares = (metrics.totalShares || 0) * rates.share;
      breakdown.followers = (metrics.followerCount || 0) * rates.follower;

      totalSparks = Object.values(breakdown).reduce((sum: number, value: number) => sum + value, 0);
    }
    else if (platform === 'spotify') {
      breakdown.views = (metrics.totalViews || 0) * rates.stream; // streams as views
      breakdown.followers = (metrics.followerCount || 0) * rates.follower;

      totalSparks = Object.values(breakdown).reduce((sum: number, value: number) => sum + value, 0);
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