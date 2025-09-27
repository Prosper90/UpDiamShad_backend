import { Beat, IBeat } from "../models/Beat";
import { User } from "../models/User";
import { logger } from "../config/logger";

interface CreateBeatRequest {
  title?: string;
  description?: string;
  contentType: "post" | "video" | "article" | "nft" | "other";
  platform?: string;
  externalId?: string;
  tags?: string[];
  isPublic?: boolean;
}

interface BeatPerformanceUpdate {
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
}

interface BeatOverview {
  totalBeats: number;
  totalValue: number;
  averageValue: number;
  trendingBeats: number;
  monthlyBeats: number;
  recentBeats: IBeat[];
}

class BeatsService {
  /**
   * Create a new Beat from Sparks-weighted cPoints
   * This is the final step: Sparks → Beats
   */
  async createBeat(
    userId: string,
    sparksAmount: number,
    beatData: CreateBeatRequest
  ): Promise<IBeat> {
    try {
      logger.info("Creating new Beat:", { userId, sparksAmount, beatData });

      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Validate sparks amount
      if (sparksAmount <= 0) {
        throw new Error("Sparks amount must be positive");
      }

      if (user.wavzProfile.sparks < sparksAmount) {
        throw new Error("Insufficient Sparks to create Beat");
      }

      // Generate unique Beat ID
      const beatId = `beat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create Beat with inherited Sparks value
      const beat = new Beat({
        beatId,
        userId,
        sparksInherited: sparksAmount,
        metadata: {
          title: beatData.title || `Beat ${beatId}`,
          description: beatData.description || "",
          contentType: beatData.contentType,
          platform: beatData.platform,
          externalId: beatData.externalId,
          tags: beatData.tags || [],
          createdAt: new Date(),
          isPublic: beatData.isPublic !== false, // Default to public
        },
        performance: {
          views: 0,
          likes: 0,
          shares: 0,
          comments: 0,
          engagement: 0,
          trending: false,
          lastUpdated: new Date(),
        },
        finalValue: sparksAmount, // Initial value equals inherited sparks
      });

      // Save Beat
      await beat.save();

      // Update user's Sparks and Beat stats
      await this.updateUserBeatStats(userId, beat);

      logger.info("Beat created successfully:", { beatId, userId, sparksAmount });

      return beat;
    } catch (error) {
      logger.error("Beat creation failed:", error);
      throw error;
    }
  }

  /**
   * Update Beat performance metrics
   */
  async updateBeatPerformance(
    beatId: string,
    performanceData: BeatPerformanceUpdate
  ): Promise<IBeat> {
    try {
      const beat = await Beat.findOne({ beatId });
      if (!beat) {
        throw new Error("Beat not found");
      }

      // Update performance using instance method
      beat.updatePerformance(performanceData);
      await beat.save();

      // Update user's beat statistics
      await this.updateUserBeatStats(beat.userId, beat);

      logger.info("Beat performance updated:", { beatId, performanceData });

      return beat;
    } catch (error) {
      logger.error("Beat performance update failed:", error);
      throw error;
    }
  }

  /**
   * Add onchain proof to Beat for value bonus
   */
  async addOnChainProof(
    beatId: string,
    proofType: "proofOfPost" | "proofOfHold" | "proofOfUse" | "proofOfSupport"
  ): Promise<IBeat> {
    try {
      const beat = await Beat.findOne({ beatId });
      if (!beat) {
        throw new Error("Beat not found");
      }

      // Add proof using instance method
      beat.addOnChainProof(proofType);
      await beat.save();

      // Update user's proof stats and beat value
      const user = await User.findById(beat.userId);
      if (user) {
        user.wavzProfile.proofStats[proofType]++;
        user.wavzProfile.beatsValue += (beat.finalValue - beat.sparksInherited); // Add the bonus value
        await user.save();
      }

      logger.info("OnChain proof added to Beat:", { beatId, proofType, newValue: beat.finalValue });

      return beat;
    } catch (error) {
      logger.error("Adding onchain proof failed:", error);
      throw error;
    }
  }

  /**
   * Get user's Beats overview
   */
  async getUserBeatsOverview(userId: string): Promise<BeatOverview> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Get all user's beats
      const allBeats = await Beat.find({ userId }).sort({ createdAt: -1 });

      // Calculate monthly beats (current month)
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const monthlyBeats = allBeats.filter(beat =>
        beat.createdAt >= currentMonth
      ).length;

      // Get trending beats
      const trendingBeats = allBeats.filter(beat =>
        beat.performance.trending
      ).length;

      // Calculate totals
      const totalBeats = allBeats.length;
      const totalValue = allBeats.reduce((sum, beat) => sum + beat.finalValue, 0);
      const averageValue = totalBeats > 0 ? totalValue / totalBeats : 0;

      // Get recent beats (last 5)
      const recentBeats = allBeats.slice(0, 5);

      return {
        totalBeats,
        totalValue,
        averageValue: Math.round(averageValue),
        trendingBeats,
        monthlyBeats,
        recentBeats,
      };
    } catch (error) {
      logger.error("Getting user beats overview failed:", error);
      throw error;
    }
  }

  /**
   * Get user's Beats list with pagination
   */
  async getUserBeats(
    userId: string,
    page: number = 1,
    limit: number = 10,
    sortBy: "createdAt" | "finalValue" | "performance.trending" = "createdAt"
  ): Promise<{ beats: IBeat[]; total: number; page: number; totalPages: number }> {
    try {
      const skip = (page - 1) * limit;

      const [beats, total] = await Promise.all([
        Beat.find({ userId })
          .sort({ [sortBy]: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        Beat.countDocuments({ userId }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        beats,
        total,
        page,
        totalPages,
      };
    } catch (error) {
      logger.error("Getting user beats failed:", error);
      throw error;
    }
  }

  /**
   * Get Beat details by ID
   */
  async getBeatDetails(beatId: string): Promise<IBeat | null> {
    try {
      return await Beat.findOne({ beatId });
    } catch (error) {
      logger.error("Getting beat details failed:", error);
      throw error;
    }
  }

  /**
   * Get trending Beats across platform
   */
  async getTrendingBeats(limit: number = 20): Promise<IBeat[]> {
    try {
      return await Beat.find({ "performance.trending": true })
        .sort({ "performance.trendingScore": -1, "performance.lastUpdated": -1 })
        .limit(limit)
        .exec();
    } catch (error) {
      logger.error("Getting trending beats failed:", error);
      throw error;
    }
  }

  /**
   * Update user's Beat statistics
   */
  private async updateUserBeatStats(userId: string, beat: IBeat): Promise<void> {
    try {
      const user = await User.findById(userId);
      if (!user) return;

      // Get all user's beats for accurate stats
      const allBeats = await Beat.find({ userId });

      const totalBeats = allBeats.length;
      const totalValue = allBeats.reduce((sum, b) => sum + b.finalValue, 0);
      const averageValue = totalBeats > 0 ? totalValue / totalBeats : 0;

      // Find best performing beat
      const bestBeat = allBeats.reduce((best, current) =>
        current.finalValue > best.finalValue ? current : best, allBeats[0]
      );

      // Count monthly beats
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const monthlyBeats = allBeats.filter(b => b.createdAt >= currentMonth).length;

      // Count trending beats
      const trendingBeats = allBeats.filter(b => b.performance.trending).length;

      // Update user's beat stats
      user.wavzProfile.totalBeats = totalBeats;
      user.wavzProfile.beatsValue = totalValue;
      user.wavzProfile.beatStats = {
        totalBeats,
        averageBeatValue: Math.round(averageValue),
        bestPerformingBeat: bestBeat ? bestBeat.beatId : "",
        monthlyBeats,
        lastBeatCreated: beat.createdAt,
        trendingBeats,
      };

      await user.save();
    } catch (error) {
      logger.error("Updating user beat stats failed:", error);
      // Don't throw - this is a background update
    }
  }

  /**
   * Delete a Beat (if user owns it)
   */
  async deleteBeat(beatId: string, userId: string): Promise<boolean> {
    try {
      const beat = await Beat.findOne({ beatId, userId });
      if (!beat) {
        throw new Error("Beat not found or not owned by user");
      }

      await Beat.deleteOne({ beatId });

      // Update user stats
      await this.updateUserBeatStats(userId, beat);

      logger.info("Beat deleted:", { beatId, userId });

      return true;
    } catch (error) {
      logger.error("Beat deletion failed:", error);
      throw error;
    }
  }

  /**
   * Search Beats by criteria
   */
  async searchBeats(
    query: {
      contentType?: string;
      platform?: string;
      tags?: string[];
      trending?: boolean;
      minValue?: number;
    },
    page: number = 1,
    limit: number = 10
  ): Promise<{ beats: IBeat[]; total: number; page: number; totalPages: number }> {
    try {
      const filter: any = { "metadata.isPublic": true };

      if (query.contentType) {
        filter["metadata.contentType"] = query.contentType;
      }

      if (query.platform) {
        filter["metadata.platform"] = query.platform;
      }

      if (query.tags && query.tags.length > 0) {
        filter["metadata.tags"] = { $in: query.tags };
      }

      if (query.trending) {
        filter["performance.trending"] = true;
      }

      if (query.minValue) {
        filter["finalValue"] = { $gte: query.minValue };
      }

      const skip = (page - 1) * limit;

      const [beats, total] = await Promise.all([
        Beat.find(filter)
          .sort({ finalValue: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        Beat.countDocuments(filter),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        beats,
        total,
        page,
        totalPages,
      };
    } catch (error) {
      logger.error("Beat search failed:", error);
      throw error;
    }
  }
}

export const beatsService = new BeatsService();