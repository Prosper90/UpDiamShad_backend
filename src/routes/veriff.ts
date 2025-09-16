import { Router } from 'express';
import { body } from 'express-validator';
import { veriffController } from '../controllers/veriffController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * Validation middleware for session creation
 */
const validateSessionCreation = [
  body('walletAddress')
    .isString()
    .matches(/^0x[a-fA-F0-9]{40}$/)
    .withMessage('Invalid wallet address format'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address')
];

/**
 * @route POST /api/veriff/session
 * @desc Create a new Veriff verification session
 * @access Public
 */
router.post('/session', validateSessionCreation, veriffController.createSession.bind(veriffController));

/**
 * @route GET /api/veriff/session/:sessionId/status
 * @desc Get verification session status
 * @access Public
 */
router.get('/session/:sessionId/status', veriffController.getSessionStatus.bind(veriffController));

/**
 * @route POST /api/veriff/webhook
 * @desc Handle Veriff webhook notifications
 * @access Public (but validated via signature)
 */
router.post('/webhook', veriffController.handleWebhook.bind(veriffController));

/**
 * @route GET /api/veriff/stats
 * @desc Get verification statistics (admin only)
 * @access Private (Admin)
 */
router.get('/stats', authenticateToken, veriffController.getVerificationStats.bind(veriffController));

export default router;