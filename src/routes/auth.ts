import { Router, Request, Response } from "express";
import { body } from "express-validator";
import { signup, login } from "../controllers/authController";
import { authenticateToken } from "../middleware/auth";
import { generateToken } from "../config/jwt";
import { logger } from "../config/logger";

const router = Router();

/**
 * @route POST /auth/signup
 * @desc Register a new user with email/password
 * @access Public
 */
router.post(
  "/signup",
  [
    body("email").isEmail().normalizeEmail(),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters"),
    body("displayName")
      .isLength({ min: 2, max: 50 })
      .withMessage("Display name must be 2-50 characters"),
  ],
  signup
);

/**
 * @route POST /auth/login
 * @desc Login user with email/password
 * @access Public
 */
router.post(
  "/login",
  [
    body("email").isEmail().normalizeEmail(),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  login
);

/**
 * @route POST /auth/refresh
 * @desc Refresh JWT token
 * @access Private
 */
router.post(
  "/refresh",
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

      // Generate new token
      const token = generateToken({
        userId: req.user._id.toString(),
        email: req.user.email,
        walletAddress: req.user.abstractWallet?.address || "",
      });

      res.json({
        success: true,
        message: "Token refreshed successfully",
        data: {
          token,
          expiresIn: "24h",
        },
      });
    } catch (error: any) {
      logger.error("Token refresh failed:", error);
      res.status(500).json({
        success: false,
        message: "Token refresh failed",
      });
    }
  }
);

/**
 * @route GET /auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get("/me", authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Migration: Ensure abstract wallet is in wallets array for existing users
    let needsMigration = false;
    if (req.user.abstractWallet?.address) {
      const hasAbstractWalletInArray = req.user.wallets?.some(
        w => w.address.toLowerCase() === req.user.abstractWallet?.address.toLowerCase() || w.id === 'abstract-wallet'
      );

      if (!hasAbstractWalletInArray) {
        needsMigration = true;
        if (!req.user.wallets) {
          req.user.wallets = [];
        }
        
        req.user.wallets.push({
          id: 'abstract-wallet',
          address: req.user.abstractWallet.address.toLowerCase(),
          type: 'abstract',
          provider: 'System Generated',
          label: 'Default Wallet',
          isDefault: req.user.wallets.length === 0, // Make default if no other wallets
          isVerified: true,
          createdAt: req.user.abstractWallet.createdAt,
        });
      }
    }

    // Save migration if needed
    if (needsMigration) {
      await req.user.save();
    }

    // Combine abstract wallet and wallets for response
    const allWallets = [...(req.user.wallets || [])];

    res.json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          email: req.user.email,
          displayName: req.user.displayName,
          username: req.user.username,
          verificationLevel: req.user.verificationLevel,
          wavzProfile: req.user.wavzProfile,
          insightIQ: req.user.insightIQ,
          abstractWallet: {
            address: req.user.abstractWallet?.address,
            network: req.user.abstractWallet?.network,
          },
          wallets: allWallets,
          preferences: req.user.preferences,
          lastLogin: req.user.lastLogin,
          createdAt: req.user.createdAt,
        },
      },
    });
  } catch (error) {
    logger.error("Error in /auth/me:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

/**
 * @route POST /auth/logout
 * @desc Logout user (client-side token removal)
 * @access Private
 */
router.post(
  "/logout",
  authenticateToken,
  (req: Request, res: Response): void => {
    // In a more sophisticated setup, you might maintain a token blacklist
    logger.info("User logged out", { userId: req.userId });

    res.json({
      success: true,
      message: "Logged out successfully",
    });
  }
);

export default router;
