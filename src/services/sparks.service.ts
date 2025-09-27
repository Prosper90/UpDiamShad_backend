import { User } from "../models/User";
import { CPointsHistory } from "../models/CPointsHistory";
import { logger } from "../config/logger";

// Sustainability weighting factors for Sparks calculation
export const SUSTAINABILITY_WEIGHTS = {
  timeMultipliers: {
    lastWeek: 1.0,
    lastMonth: 0.8,
    last3Months: 0.6,
    last6Months: 0.4,
    older: 0.2,
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
    let totalCPoints = 0;
    let weightedTimeSum = 0;
    let weightedPlatformSum = 0;
    let totalWeight = 0;

    // Process each cPoints entry
    for (const entry of cPointsHistory) {
      const cPoints = entry.totalCPoints;
      if (cPoints <= 0) continue;

      totalCPoints += cPoints;

      // Calculate time weighting (newer = higher weight)
      const timeWeight = this.calculateTimeWeight(entry.processedAt);

      // Calculate platform weighting
      const platformWeight = this.calculatePlatformWeight(entry.rawEngagement);

      // Apply sustainability formula: cPoints * timeWeight * platformWeight
      const entrySparks = cPoints * timeWeight * platformWeight;
      totalSparks += entrySparks;

      // Track weighted averages
      weightedTimeSum += timeWeight * cPoints;
      weightedPlatformSum += platformWeight * cPoints;
      totalWeight += cPoints;
    }

    // Calculate consistency bonus
    const consistencyMultiplier =
      this.calculateConsistencyBonus(cPointsHistory);
    totalSparks *= consistencyMultiplier;

    // Calculate weighted averages
    const avgTimeWeight = totalWeight > 0 ? weightedTimeSum / totalWeight : 0;
    const avgPlatformWeight =
      totalWeight > 0 ? weightedPlatformSum / totalWeight : 0;
    const sustainabilityMultiplier =
      avgTimeWeight * avgPlatformWeight * consistencyMultiplier;

    // Calculate level information
    const levelInfo = this.calculateLevelInfo(Math.round(totalSparks));

    return {
      totalSparks: Math.round(totalSparks),
      breakdown: {
        baseCPoints: totalCPoints,
        sustainabilityMultiplier,
        consistencyBonus: consistencyMultiplier,
        timeWeighting: avgTimeWeight,
        platformWeighting: avgPlatformWeight,
      },
      levelInfo,
    };
  }

  /**
   * Calculate time-based weighting (newer content has higher sustainability)
   */
  private calculateTimeWeight(processedAt: Date): number {
    const now = new Date();
    const daysDiff =
      (now.getTime() - processedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 7) return SUSTAINABILITY_WEIGHTS.timeMultipliers.lastWeek;
    if (daysDiff <= 30) return SUSTAINABILITY_WEIGHTS.timeMultipliers.lastMonth;
    if (daysDiff <= 90)
      return SUSTAINABILITY_WEIGHTS.timeMultipliers.last3Months;
    if (daysDiff <= 180)
      return SUSTAINABILITY_WEIGHTS.timeMultipliers.last6Months;
    return SUSTAINABILITY_WEIGHTS.timeMultipliers.older;
  }

  /**
   * Calculate platform-based weighting (different platforms have different sustainability)
   */
  private calculatePlatformWeight(rawEngagement: any[]): number {
    if (!rawEngagement || rawEngagement.length === 0) return 1.0;

    const platformCounts: { [platform: string]: number } = {};
    let totalContent = 0;

    // Count content per platform
    for (const engagement of rawEngagement) {
      const platform = engagement.platform.toLowerCase();
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
      totalContent++;
    }

    // Calculate weighted average based on platform distribution
    let weightedSum = 0;
    for (const [platform, count] of Object.entries(platformCounts)) {
      const platformWeight =
        SUSTAINABILITY_WEIGHTS.platformMultipliers[
          platform as keyof typeof SUSTAINABILITY_WEIGHTS.platformMultipliers
        ] || 1.0;
      const platformRatio = count / totalContent;
      weightedSum += platformWeight * platformRatio;
    }

    return weightedSum;
  }

  /**
   * Calculate consistency bonus based on posting frequency
   */
  private calculateConsistencyBonus(cPointsHistory: any[]): number {
    if (cPointsHistory.length < 2)
      return SUSTAINABILITY_WEIGHTS.consistencyBonus.irregular;

    // Calculate average time between cPoints calculations
    const timeDiffs: number[] = [];
    for (let i = 1; i < cPointsHistory.length; i++) {
      const diff =
        cPointsHistory[i - 1].processedAt.getTime() -
        cPointsHistory[i].processedAt.getTime();
      timeDiffs.push(diff / (1000 * 60 * 60 * 24)); // Convert to days
    }

    const avgDaysBetween =
      timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;

    // Classify consistency
    if (avgDaysBetween <= 1)
      return SUSTAINABILITY_WEIGHTS.consistencyBonus.daily;
    if (avgDaysBetween <= 7)
      return SUSTAINABILITY_WEIGHTS.consistencyBonus.weekly;
    if (avgDaysBetween <= 14)
      return SUSTAINABILITY_WEIGHTS.consistencyBonus.biweekly;
    if (avgDaysBetween <= 30)
      return SUSTAINABILITY_WEIGHTS.consistencyBonus.monthly;
    return SUSTAINABILITY_WEIGHTS.consistencyBonus.irregular;
  }

  /**
   * Calculate level information from Sparks amount
   */
  private calculateLevelInfo(sparks: number): {
    currentLevel: number;
    levelName: string;
    progress: number;
    nextLevelAt: number;
  } {
    const levelNames = [
      "",
      "Pulse",
      "Rhythm",
      "Harmony",
      "Melody",
      "Resonance",
    ];

    let currentLevel = 1;
    for (const [level, threshold] of Object.entries(LEVEL_THRESHOLDS)) {
      if (sparks >= threshold) {
        currentLevel = parseInt(level);
      }
    }

    const currentThreshold =
      LEVEL_THRESHOLDS[currentLevel as keyof typeof LEVEL_THRESHOLDS];
    const nextLevel = currentLevel < 5 ? currentLevel + 1 : 5;
    const nextThreshold =
      LEVEL_THRESHOLDS[nextLevel as keyof typeof LEVEL_THRESHOLDS];

    const progress =
      nextLevel > currentLevel
        ? ((sparks - currentThreshold) / (nextThreshold - currentThreshold)) *
          100
        : 100;

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
   * Get user's current Sparks information
   */
  async getUserSparksInfo(userId: string): Promise<{
    sparks: number;
    level: number;
    levelName: string;
    progress: number;
    nextLevelAt: number;
  }> {
    try {
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
