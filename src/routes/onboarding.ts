import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { User, IUser } from '../models/User';
import { authenticateToken } from '../middleware/auth';
import { logger } from '../config/logger';

const router = Router();

/**
 * @route POST /onboarding/role
 * @desc Set user role (creator or fan) during onboarding
 * @access Private
 */
router.post(
  '/role',
  authenticateToken,
  [
    body('role').isIn(['creator', 'fan']).withMessage('Role must be either "creator" or "fan"')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      const { role } = req.body;

      // Update user's Wavz profile with role
      req.user.wavzProfile.role = role;
      req.user.wavzProfile.isOnboarded = true;
      req.user.wavzProfile.onboardedAt = new Date();
      req.user.wavzProfile.lastActivityAt = new Date();

      // Give starting Sparks based on role
      if (role === 'creator') {
        req.user.wavzProfile.sparks = 100; // Starting bonus for creators
      } else if (role === 'fan') {
        req.user.wavzProfile.sparks = 50; // Starting bonus for fans
      }

      await req.user.save();

      logger.info('User completed onboarding', {
        userId: req.user._id,
        role,
        sparks: req.user.wavzProfile.sparks
      });

      res.json({
        success: true,
        message: `Welcome to Diamondz as a ${role}!`,
        data: {
          wavzProfile: req.user.wavzProfile
        }
      });
    } catch (error: any) {
      logger.error('Onboarding role selection failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete onboarding',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

/**
 * @route GET /onboarding/status
 * @desc Check if user has completed onboarding
 * @access Private
 */
router.get('/status', authenticateToken, (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'User not found'
    });
    return;
  }

  res.json({
    success: true,
    data: {
      isOnboarded: req.user.wavzProfile.isOnboarded,
      role: req.user.wavzProfile.role,
      onboardedAt: req.user.wavzProfile.onboardedAt,
      nextStep: req.user.wavzProfile.isOnboarded ? 'dashboard' : 'role-selection'
    }
  });
});

/**
 * @route POST /onboarding/sparks
 * @desc Award Sparks for completing actions (for testing/admin)
 * @access Private
 */
router.post(
  '/sparks',
  authenticateToken,
  [
    body('amount').isInt({ min: 1, max: 10000 }).withMessage('Amount must be between 1 and 10000'),
    body('reason').optional().isString().withMessage('Reason must be a string')
  ],
  async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      const { amount, reason = 'Manual award' } = req.body;

      // Add Sparks
      const oldSparks = req.user.wavzProfile.sparks;
      req.user.wavzProfile.sparks += amount;
      req.user.wavzProfile.lastActivityAt = new Date();

      // Calculate new level (basic level calculation)
      const levelThresholds = [0, 1000, 5000, 25000, 100000]; // For creators
      let newLevel = 1;
      
      for (let i = levelThresholds.length - 1; i >= 0; i--) {
        if (req.user.wavzProfile.sparks >= levelThresholds[i]) {
          newLevel = i + 1;
          break;
        }
      }

      const oldLevel = req.user.wavzProfile.level;
      req.user.wavzProfile.level = newLevel;

      // Calculate progress to next level
      const currentLevelMin = levelThresholds[newLevel - 1];
      const nextLevelMin = levelThresholds[newLevel] || levelThresholds[levelThresholds.length - 1];
      
      if (newLevel < 5) {
        const progressInLevel = req.user.wavzProfile.sparks - currentLevelMin;
        const totalNeededForLevel = nextLevelMin - currentLevelMin;
        req.user.wavzProfile.levelProgress = Math.round((progressInLevel / totalNeededForLevel) * 100);
      } else {
        req.user.wavzProfile.levelProgress = 100; // Max level
      }

      await req.user.save();

      logger.info('Sparks awarded', {
        userId: req.user._id,
        amount,
        reason,
        oldSparks,
        newSparks: req.user.wavzProfile.sparks,
        oldLevel,
        newLevel,
        levelUp: newLevel > oldLevel
      });

      res.json({
        success: true,
        message: newLevel > oldLevel ? `Level up! You're now level ${newLevel}!` : `${amount} Sparks awarded!`,
        data: {
          sparksAwarded: amount,
          totalSparks: req.user.wavzProfile.sparks,
          level: req.user.wavzProfile.level,
          levelProgress: req.user.wavzProfile.levelProgress,
          levelUp: newLevel > oldLevel,
          reason
        }
      });
    } catch (error: any) {
      logger.error('Sparks award failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to award Sparks',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

export default router;