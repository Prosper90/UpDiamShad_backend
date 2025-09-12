import { Router } from 'express';
import { walletController } from '../controllers/walletController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All wallet routes require authentication
router.use(authenticateToken);

/**
 * @route GET /api/wallet/list
 * @desc Get all wallets for the authenticated user
 * @access Private
 */
router.get('/list', walletController.getWallets.bind(walletController));

/**
 * @route POST /api/wallet/add
 * @desc Add a new wallet to user's account
 * @access Private
 */
router.post('/add', walletController.addWallet.bind(walletController));

/**
 * @route PUT /api/wallet/:walletId/primary
 * @desc Set a wallet as primary
 * @access Private
 */
router.put('/:walletId/primary', walletController.setPrimaryWallet.bind(walletController));

/**
 * @route PUT /api/wallet/:walletId/label
 * @desc Update wallet label
 * @access Private
 */
router.put('/:walletId/label', walletController.updateWalletLabel.bind(walletController));

/**
 * @route DELETE /api/wallet/:walletId
 * @desc Remove a wallet from user's account
 * @access Private
 */
router.delete('/:walletId', walletController.removeWallet.bind(walletController));

/**
 * @route POST /api/wallet/:walletId/verify
 * @desc Verify wallet ownership through signature
 * @access Private
 */
router.post('/:walletId/verify', walletController.verifyWallet.bind(walletController));

export default router;