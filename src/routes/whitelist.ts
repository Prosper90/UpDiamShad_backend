import { Router } from 'express';
import { body } from 'express-validator';
import { whitelistController } from '../controllers/whitelistController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * Validation middleware for whitelist submission
 */
const validateWhitelistSubmission = [
  body('wallet_address')
    .isString()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid EVM wallet address format'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('reason')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Reason must be less than 500 characters'),
  body('twitter')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Twitter handle must be less than 50 characters'),
  body('discord')
    .optional()
    .isString()
    .isLength({ max: 50 })
    .withMessage('Discord handle must be less than 50 characters'),
  body('is_kyc_verified')
    .optional()
    .isBoolean()
    .withMessage('KYC verification status must be a boolean')
];

/**
 * @route POST /api/whitelist
 * @desc Submit a new whitelist entry
 * @access Public
 */
router.post('/', validateWhitelistSubmission, whitelistController.submitEntry.bind(whitelistController));

/**
 * @route GET /api/whitelist/stats
 * @desc Get whitelist statistics
 * @access Public
 */
router.get('/stats', whitelistController.getStats.bind(whitelistController));

/**
 * @route GET /api/whitelist
 * @desc Get all whitelist entries (admin only)
 * @access Private (Admin)
 */
router.get('/', authenticateToken, whitelistController.getAllEntries.bind(whitelistController));

/**
 * @route PUT /api/whitelist/:id/status
 * @desc Update whitelist entry status (admin only)
 * @access Private (Admin)
 */
router.put('/:id/status', 
  authenticateToken,
  body('status').isIn(['pending', 'approved', 'rejected']).withMessage('Invalid status'),
  whitelistController.updateStatus.bind(whitelistController)
);

/**
 * @route DELETE /api/whitelist/:id
 * @desc Delete whitelist entry (admin only)
 * @access Private (Admin)
 */
router.delete('/:id', authenticateToken, whitelistController.deleteEntry.bind(whitelistController));

export default router;