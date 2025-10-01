import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { User, IUser } from "../models/User";
import { authenticateToken } from "../middleware/auth";
import { logger } from "../config/logger";
import {
  insightIQService,
  InsightIQAccount,
} from "../services/insightiq.service";
import { sparksService } from "../services/sparks.service";

const router = Router();

/**
 * @route POST /insightiq/create-user
 * @desc Create InsightIQ user for current Wavz user
 * @access Private
 */
router.post(
  "/create-user",
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      // Check if user already has InsightIQ integration
      if (req.user.insightIQ?.userId) {
        res.status(409).json({
          success: false,
          message: "User already has InsightIQ integration",
          data: {
            userId: req.user.insightIQ.userId,
            isActive: req.user.insightIQ.isConnected,
          },
        });
        return;
      }

      // Create user in InsightIQ
      const insightIqUser = await insightIQService.createUser(
        req.user.displayName,
        req.user.email
      );

      // Update user with InsightIQ integration
      req.user.insightIQ = {
        userId: insightIqUser.id,
        external_id: insightIqUser.external_id,
        sdkToken: null,
        tokenExpiresAt: null,
        isConnected: true,
        connectedAt: new Date(),
        connectedAccounts: [],
        createdAt: new Date(),
      };

      await req.user.save();

      logger.info("InsightIQ user created successfully", {
        userId: req.user._id,
        insightIqUserId: insightIqUser.id,
      });

      res.status(201).json({
        success: true,
        message: "InsightIQ user created successfully",
        data: {
          userId: insightIqUser.id,
          createdAt: insightIqUser.created_at,
        },
      });
    } catch (error: any) {
      logger.error("InsightIQ user creation failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create InsightIQ user",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route POST /insightiq/sdk-token
 * @desc Get or generate SDK token for frontend Connect modal with caching
 * @access Private
 */
router.post(
  "/sdk-token",
  authenticateToken,
  [
    body("products")
      .optional()
      .isArray()
      .withMessage("Products must be an array"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (!req.user.insightIQ?.userId) {
        res.status(400).json({
          success: false,
          message:
            "User does not have InsightIQ integration. Please create user first.",
          action: "create_user_first",
        });
        return;
      }

      const { products = ["IDENTITY", "IDENTITY.AUDIENCE", "ENGAGEMENT", "ENGAGEMENT.COMMENTS"] } = req.body;

      // Use enhanced token management with caching
      const tokenData = await insightIQService.getOrCreateSDKToken(
        req.user.insightIQ.sdkToken,
        req.user.insightIQ.tokenExpiresAt,
        req.user.insightIQ.userId,
        products
      );

      // Update user with new token if one was created
      if (tokenData.isNew) {
        req.user.insightIQ.sdkToken = tokenData.token;
        req.user.insightIQ.tokenExpiresAt = tokenData.expiresAt;
        await req.user.save();
      }

      logger.info("SDK token retrieved successfully", {
        userId: req.user._id,
        insightIqUserId: req.user.insightIQ.userId,
        products,
        isNew: tokenData.isNew,
        expiresAt: tokenData.expiresAt,
      });

      res.json({
        success: true,
        message: tokenData.isNew
          ? "New SDK token generated successfully"
          : "Existing valid SDK token returned",
        data: {
          sdk_token: tokenData.token,
          expires_at: tokenData.expiresAt.toISOString(),
          user_id: req.user.insightIQ.userId,
          is_cached: !tokenData.isNew,
        },
      });
    } catch (error: any) {
      logger.error("SDK token retrieval failed:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve SDK token",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route POST /insightiq/accounts/connect
 * @desc Save connected account from Phyllo callback
 * @access Private
 */
router.post(
  "/accounts/connect",
  authenticateToken,
  [
    body("accountId")
      .isString()
      .notEmpty()
      .withMessage("Account ID is required"),
    body("workplatformId")
      .isString()
      .notEmpty()
      .withMessage("Work platform ID is required"),
    body("userId")
      .isString()
      .notEmpty()
      .withMessage("User ID is required"),
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (!req.user.insightIQ?.userId) {
        res.status(400).json({
          success: false,
          message: "User does not have InsightIQ integration",
        });
        return;
      }

      const { accountId, workplatformId, userId } = req.body;

      // Verify the userId matches the user's InsightIQ integration
      if (userId !== req.user.insightIQ.userId) {
        res.status(400).json({
          success: false,
          message: "User ID mismatch",
        });
        return;
      }

      // Get platform name dynamically from work-platforms API
      let platform: string;
      let workPlatformName: string;

      try {
        // First try to get work platform details
        const workPlatformData = await insightIQService.getWorkPlatform(workplatformId);
        workPlatformName = workPlatformData.name;

        // Map platform names to our enum
        const platformNameToEnumMap: Record<string, string> = {
          "YouTube": "youtube",
          "Instagram": "instagram",
          "TikTok": "tiktok",
          "Twitter": "twitter",
          "Twitch": "twitch",
          // Add more mappings as needed
        };

        platform = platformNameToEnumMap[workPlatformName];

        if (!platform) {
          logger.warn("Unknown platform name from InsightIQ:", {
            workplatformId,
            workPlatformName,
            accountId,
            userId: req.user._id,
            message: "Please add this platform name to platformNameToEnumMap"
          });

          res.status(400).json({
            success: false,
            message: `Unsupported platform: ${workPlatformName}. Please contact support.`,
            debug: process.env.NODE_ENV === "development" ? {
              workplatformId,
              workPlatformName,
              suggestion: "Add this platform name to the enum mapping"
            } : undefined
          });
          return;
        }

        logger.info("Platform resolved dynamically:", {
          workplatformId,
          workPlatformName,
          platform,
          accountId
        });

      } catch (error) {
        logger.error("Failed to resolve work platform dynamically:", {
          workplatformId,
          accountId,
          error: error instanceof Error ? error.message : error
        });

        res.status(500).json({
          success: false,
          message: "Failed to resolve platform information. Please try again.",
          debug: process.env.NODE_ENV === "development" ? {
            workplatformId,
            error: error instanceof Error ? error.message : "Unknown error"
          } : undefined
        });
        return;
      }

      // Check if account already exists
      const existingAccountIndex = req.user.insightIQ.connectedAccounts.findIndex(
        (account) => account.accountId === accountId
      );

      if (existingAccountIndex !== -1) {
        // Update existing account
        req.user.insightIQ.connectedAccounts[existingAccountIndex].isActive = true;
        req.user.insightIQ.connectedAccounts[existingAccountIndex].connectedAt = new Date();
        req.user.insightIQ.connectedAccounts[existingAccountIndex].lastSyncAt = new Date();
      } else {
        // Add new account with minimal data
        const newAccount = {
          accountId,
          platform: platform as "youtube" | "tiktok" | "instagram" | "twitter" | "twitch",
          username: "syncing...", // Temporary until we get real data
          displayName: "Syncing account...", // Temporary until we get real data
          profilePicture: undefined,
          followerCount: 0,
          isActive: true,
          connectedAt: new Date(),
          lastSyncAt: new Date(),
        };

        req.user.insightIQ.connectedAccounts.push(newAccount);
      }

      await req.user.save();

      // Start background enrichment (don't await to return immediately)
      insightIQService.enrichAccountData(req.user.insightIQ.userId, accountId)
        .catch((error) => {
          logger.warn("Background account enrichment failed (non-critical):", {
            userId: req.user!._id,
            accountId,
            error: error.message,
          });
        });

      logger.info("Account connected via Phyllo callback:", {
        userId: req.user._id,
        accountId,
        platform,
        workplatformId,
        workPlatformName,
        mappingMethod: "dynamic",
      });

      res.status(201).json({
        success: true,
        message: "Account connected successfully",
        data: {
          accountId,
          platform,
          status: "syncing",
        },
      });
    } catch (error: any) {
      logger.error("Failed to save connected account:", error);
      res.status(500).json({
        success: false,
        message: "Failed to save connected account",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route GET /insightiq/accounts
 * @desc Get all connected social media accounts
 * @access Private
 */
router.get(
  "/accounts",
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (!req.user.insightIQ?.userId) {
        res.status(400).json({
          success: false,
          message: "User does not have InsightIQ integration",
          data: { connectedAccounts: [] },
        });
        return;
      }

      // For now, return local accounts since we don't have a bulk endpoint
      // In the future, we could sync each account individually using the new API
      const localAccounts = req.user.insightIQ.connectedAccounts;

      // Optionally sync individual accounts in background (don't await)
      // Only sync accounts that haven't been synced recently to avoid API rate limits
      localAccounts.forEach(account => {
        if (account.accountId && req.user?.insightIQ?.userId) {
          const lastSync = account.lastSyncAt;
          const shouldSync = !lastSync || (new Date().getTime() - new Date(lastSync).getTime()) > 5 * 60 * 1000; // 5 minutes

          if (shouldSync) {
            insightIQService.enrichAccountData(req.user.insightIQ.userId, account.accountId)
              .catch(error => {
                logger.warn("Background sync failed for account (non-critical):", {
                  accountId: account.accountId,
                  error: error.message
                });
              });
          }
        }
      });

      logger.info("Connected accounts retrieved", {
        userId: req.user._id,
        accountCount: localAccounts.length,
      });

      res.json({
        success: true,
        data: {
          connectedAccounts: localAccounts,
          count: localAccounts.length,
        },
      });
    } catch (error: any) {
      logger.error("Failed to get connected accounts:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve connected accounts",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route GET /insightiq/metrics/:accountId
 * @desc Get analytics metrics for a specific account
 * @access Private
 */
router.get(
  "/metrics/:accountId",
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (!req.user.insightIQ?.userId) {
        res.status(400).json({
          success: false,
          message: "User does not have InsightIQ integration",
        });
        return;
      }

      const { accountId } = req.params;
      const { period = "last_30_days" } = req.query;

      // Check if account belongs to this user
      const userAccount = req.user.insightIQ.connectedAccounts.find(
        (account) => account.accountId === accountId
      );

      if (!userAccount) {
        res.status(404).json({
          success: false,
          message: "Account not found or not owned by user",
        });
        return;
      }

      // Get metrics from InsightIQ
      const metrics = await insightIQService.getAccountMetrics(
        accountId,
        period as string
      );

      logger.info("Account metrics retrieved", {
        userId: req.user._id,
        accountId,
        period,
        followers: metrics.metrics.followers,
      });

      res.json({
        success: true,
        data: {
          account: userAccount,
          metrics: metrics.metrics,
          period: metrics.period,
          updated_at: metrics.updated_at,
        },
      });
    } catch (error: any) {
      logger.error("Failed to get account metrics:", error);
      res.status(500).json({
        success: false,
        message: "Failed to retrieve account metrics",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route DELETE /insightiq/accounts/:accountId
 * @desc Disconnect a social media account
 * @access Private
 */
router.delete(
  "/accounts/:accountId",
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (!req.user.insightIQ?.userId) {
        res.status(400).json({
          success: false,
          message: "User does not have InsightIQ integration",
        });
        return;
      }

      const { accountId } = req.params;

      // Check if account belongs to this user
      const accountIndex = req.user.insightIQ.connectedAccounts.findIndex(
        (account) => account.accountId === accountId
      );

      if (accountIndex === -1) {
        res.status(404).json({
          success: false,
          message: "Account not found or not owned by user",
        });
        return;
      }

      // Disconnect account from InsightIQ
      const disconnected = await insightIQService.disconnectAccount(accountId);

      if (!disconnected) {
        res.status(500).json({
          success: false,
          message: "Failed to disconnect account from InsightIQ",
        });
        return;
      }

      // Remove account from local database
      const removedAccount = req.user.insightIQ.connectedAccounts[accountIndex];
      req.user.insightIQ.connectedAccounts.splice(accountIndex, 1);
      await req.user.save();

      logger.info("Account disconnected successfully", {
        userId: req.user._id,
        accountId,
        platform: removedAccount.platform,
        username: removedAccount.username,
      });

      res.json({
        success: true,
        message: "Account disconnected successfully",
        data: {
          disconnectedAccount: removedAccount,
        },
      });
    } catch (error: any) {
      logger.error("Failed to disconnect account:", error);
      res.status(500).json({
        success: false,
        message: "Failed to disconnect account",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

/**
 * @route GET /insightiq/status
 * @desc Get InsightIQ integration status for current user
 * @access Private
 */
router.get(
  "/status",
  authenticateToken,
  (req: Request, res: Response): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    const integration = req.user.insightIQ;

    res.json({
      success: true,
      data: {
        hasIntegration: !!integration?.userId,
        isActive: integration?.isConnected || false,
        userId: integration?.userId,
        connectedAccountsCount: integration?.connectedAccounts?.length || 0,
        connectedPlatforms:
          integration?.connectedAccounts?.map((account) => account.platform) ||
          [],
        createdAt: integration?.createdAt,
      },
    });
  }
);

/**
 * @route POST /insightiq/calculate-sparks
 * @desc Get platform metrics and calculate Sparks using delta approach (only NEW engagements)
 * @access Private
 */
router.post(
  "/calculate-sparks",
  authenticateToken,
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          message: "User not found",
        });
        return;
      }

      if (!req.user.insightIQ?.userId) {
        res.status(400).json({
          success: false,
          message: "User does not have InsightIQ integration",
        });
        return;
      }

      const connectedAccounts = req.user.insightIQ.connectedAccounts.filter(
        account => account.isActive
      );

      if (connectedAccounts.length === 0) {
        res.status(400).json({
          success: false,
          message: "No connected accounts found",
        });
        return;
      }

      const platformResults = [];
      const deltaBreakdown = [];

      // Process each connected account with delta tracking
      for (const account of connectedAccounts) {
        try {
          const accountStartTime = Date.now();

          logger.info("Fetching ALL content with pagination for account:", {
            accountId: account.accountId,
            platform: account.platform,
            username: account.username
          });

          // Fetch ALL content with pagination (not just 100)
          const allContent = await insightIQService.getAllContentWithEngagements(
            account.accountId
          );

          if (allContent.length === 0) {
            logger.warn("No content found for account:", {
              accountId: account.accountId,
              platform: account.platform
            });
            continue;
          }

          // Aggregate current engagement totals
          const aggregatedMetrics = insightIQService.aggregateEngagementMetrics(allContent);

          // Fetch fresh profile data for accurate follower count
          let followerCount = account.followerCount || 0;
          let profileDataFetched = false;
          try {
            const profileData = await insightIQService.getProfile(account.accountId);
            if (profileData?.reputation) {
              followerCount =
                profileData.reputation.follower_count ||
                profileData.reputation.subscriber_count ||
                0;

              profileDataFetched = true;

              logger.info("Fetched fresh follower count from profile:", {
                accountId: account.accountId,
                platform: account.platform,
                followerCount
              });

              // Update account.followerCount in database with fresh data
              try {
                const { User } = await import("../models/User");
                const userToUpdate = await User.findById(req.user._id);

                if (userToUpdate) {
                  const accountIdx = userToUpdate.insightIQ!.connectedAccounts.findIndex(
                    (a) => a.accountId === account.accountId
                  );

                  if (accountIdx !== -1) {
                    userToUpdate.insightIQ!.connectedAccounts[accountIdx].followerCount = followerCount;
                    userToUpdate.insightIQ!.connectedAccounts[accountIdx].lastSyncAt = new Date();
                    await userToUpdate.save();

                    logger.info("Updated account followerCount in database:", {
                      accountId: account.accountId,
                      platform: account.platform,
                      followerCount
                    });
                  }
                }
              } catch (dbError: any) {
                logger.warn("Failed to update account followerCount in DB (non-critical):", {
                  accountId: account.accountId,
                  error: dbError.message
                });
              }
            }
          } catch (profileError: any) {
            logger.warn("Could not fetch fresh profile data, using cached follower count:", {
              accountId: account.accountId,
              cachedFollowerCount: followerCount,
              error: profileError.message
            });
          }

          const currentMetrics = {
            platform: account.platform,
            totalLikes: aggregatedMetrics.totalLikes,
            totalDislikes: aggregatedMetrics.totalDislikes,
            totalComments: aggregatedMetrics.totalComments,
            totalViews: aggregatedMetrics.totalViews,
            totalShares: aggregatedMetrics.totalShares,
            totalSaves: aggregatedMetrics.totalSaves,
            totalWatchTime: aggregatedMetrics.totalWatchTime,
            totalImpressions: aggregatedMetrics.totalImpressions,
            totalReach: aggregatedMetrics.totalReach,
            followerCount: followerCount,
          };

          // Get last snapshot for delta calculation
          const lastSnapshot = await sparksService.getLastSnapshot(
            req.user._id.toString(),
            account.accountId
          );

          // Calculate delta (what's NEW since last sync)
          const delta = sparksService.calculateDelta(currentMetrics, lastSnapshot);

          // Calculate Sparks from DELTA only (not total)
          const deltaSparks = sparksService.calculateSparksFromDelta(delta, account.platform);

          // Save new snapshot
          const accountDuration = Date.now() - accountStartTime;
          await sparksService.saveSnapshot(
            req.user._id.toString(),
            account.accountId,
            account.platform,
            currentMetrics,
            delta,
            deltaSparks,
            allContent.length,
            accountDuration
          );

          // Use delta sparks for platform result
          const platformMetrics = {
            platform: account.platform,
            totalLikes: delta.likes,
            totalDislikes: delta.dislikes,
            totalComments: delta.comments,
            totalViews: delta.views,
            totalShares: delta.shares,
            totalSaves: delta.saves,
            totalWatchTime: delta.watchTime,
            totalImpressions: delta.impressions,
            totalReach: delta.reach,
            followerCount: account.followerCount || 0,
          };

          const sparksResult = sparksService.calculatePlatformSparks(platformMetrics);
          platformResults.push(sparksResult);

          // Track delta breakdown for frontend
          deltaBreakdown.push({
            platform: account.platform,
            username: account.username,
            delta,
            sparksFromDelta: deltaSparks,
            totalContent: allContent.length,
            isFirstSync: !lastSnapshot,
            previousTotal: lastSnapshot?.snapshot.totalLikes || 0,
            currentTotal: currentMetrics.totalLikes
          });

          logger.info("Platform Sparks calculated (DELTA):", {
            platform: account.platform,
            deltaSparks,
            contentCount: allContent.length,
            isFirstSync: !lastSnapshot
          });

        } catch (accountError: any) {
          logger.error("Failed to process account:", {
            accountId: account.accountId,
            platform: account.platform,
            error: accountError.message
          });
          continue;
        }
      }

      if (platformResults.length === 0) {
        res.status(500).json({
          success: false,
          message: "Failed to calculate Sparks for any connected accounts",
        });
        return;
      }

      // Calculate total Sparks across all platforms
      const totalResult = sparksService.calculateTotalSparks(platformResults);

      // Update user's Wavz profile with calculated Sparks
      await sparksService.updateUserSparksLegacy(req.user._id.toString(), totalResult.totalSparks);

      const totalDuration = Date.now() - startTime;

      logger.info("Sparks calculation completed (DELTA approach):", {
        userId: req.user._id,
        totalSparks: totalResult.totalSparks,
        platformCount: platformResults.length,
        platforms: platformResults.map(p => p.platform),
        duration: totalDuration
      });

      res.json({
        success: true,
        message: "Sparks calculated and updated successfully using delta tracking",
        data: {
          totalSparks: totalResult.totalSparks,
          platformBreakdown: totalResult.platformBreakdown,
          deltaBreakdown, // NEW: show what changed
          consolidatedMetrics: totalResult.consolidatedMetrics,
          calculatedAt: new Date().toISOString(),
          syncDuration: totalDuration,
        },
      });

    } catch (error: any) {
      logger.error("Failed to calculate Sparks:", error);
      res.status(500).json({
        success: false,
        message: "Failed to calculate Sparks",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

export default router;
