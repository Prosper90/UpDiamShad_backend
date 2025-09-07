import { Router, Request, Response } from "express";
import { body, validationResult } from "express-validator";
import { User, IUser } from "../models/User";
import { authenticateToken } from "../middleware/auth";
import { logger } from "../config/logger";
import {
  insightIQService,
  InsightIQAccount,
} from "../services/insightiq.service";

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

      const { products = ["IDENTITY", "ENGAGEMENT"] } = req.body;

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

      // Get connected accounts from InsightIQ
      const accounts = await insightIQService.getConnectedAccounts(
        req.user.insightIQ.userId
      );

      // Update local database with latest account info
      const updatedAccounts = accounts.map((account) => ({
        accountId: account.account_id,
        platform: account.platform as
          | "youtube"
          | "tiktok"
          | "instagram"
          | "twitter"
          | "twitch",
        username: account.username,
        displayName: account.display_name,
        profilePicture: account.profile_picture,
        followerCount: account.follower_count || 0,
        isActive: account.is_connected,
        connectedAt: new Date(account.connected_at),
        lastSyncAt: new Date(),
      }));

      req.user.insightIQ.connectedAccounts = updatedAccounts;
      await req.user.save();

      logger.info("Connected accounts retrieved", {
        userId: req.user._id,
        accountCount: accounts.length,
      });

      res.json({
        success: true,
        data: {
          connectedAccounts: updatedAccounts,
          count: accounts.length,
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

export default router;
