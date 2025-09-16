import { Request, Response } from 'express';
import { User, IUser, IWalletInfo } from '../models/User';
import mongoose from 'mongoose';

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export class WalletController {
  /**
   * Get all wallets for the authenticated user
   */
  async getWallets(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'Authentication required'
        });
      }

      const user = await User.findById(userId).select('wallets abstractWallet');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'User does not exist'
        });
      }

      // Combine abstract wallet and additional wallets
      const allWallets: IWalletInfo[] = [...(user.wallets || [])];
      
      // Add abstract wallet if it exists and isn't already in the wallets array
      if (user.abstractWallet?.address) {
        const abstractWalletExists = allWallets.some(w => w.address.toLowerCase() === user.abstractWallet!.address.toLowerCase());
        if (!abstractWalletExists) {
          const abstractWalletInfo: IWalletInfo = {
            id: 'abstract-wallet',
            address: user.abstractWallet.address,
            type: 'abstract',
            provider: 'System Generated',
            label: 'Default Wallet',
            isDefault: allWallets.length === 0, // Make it default if no other wallets exist
            isVerified: true, // Abstract wallets are always verified
            createdAt: user.abstractWallet.createdAt,
          };
          allWallets.unshift(abstractWalletInfo); // Add at beginning
        }
      }

      return res.json({
        success: true,
        message: 'Wallets retrieved successfully',
        data: {
          wallets: allWallets,
          primaryWalletId: allWallets.find(w => w.isDefault)?.id || allWallets[0]?.id
        }
      });
    } catch (error) {
      console.error('Error getting wallets:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve wallets',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Add a new wallet to the user's account
   */
  async addWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'Authentication required'
        });
      }

      const { address, provider, type, label } = req.body;

      // Validation
      if (!address || !type) {
        return res.status(400).json({
          success: false,
          message: 'Address and type are required',
          error: 'Missing required fields'
        });
      }

      if (!['connected', 'external'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid wallet type. Must be "connected" or "external"',
          error: 'Invalid input'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'User does not exist'
        });
      }

      // Check if wallet address already exists
      const normalizedAddress = address.toLowerCase();
      const existingWallet = user.wallets?.find(w => w.address.toLowerCase() === normalizedAddress);
      const isAbstractWallet = user.abstractWallet?.address?.toLowerCase() === normalizedAddress;

      if (existingWallet || isAbstractWallet) {
        return res.status(409).json({
          success: false,
          message: 'Wallet address already exists',
          error: 'Duplicate wallet address'
        });
      }

      // Create new wallet
      const newWallet: IWalletInfo = {
        id: new mongoose.Types.ObjectId().toString(),
        address: normalizedAddress,
        type: type as "connected" | "external",
        provider: provider || 'Unknown',
        label: label || `${type.charAt(0).toUpperCase() + type.slice(1)} Wallet`,
        isDefault: user.wallets?.length === 0 && !user.abstractWallet, // Make default if no other wallets
        isVerified: false,
        createdAt: new Date(),
      };

      // Add to user's wallets array
      if (!user.wallets) {
        user.wallets = [];
      }
      user.wallets.push(newWallet);

      await user.save();

      return res.status(201).json({
        success: true,
        message: 'Wallet added successfully',
        data: {
          wallet: newWallet
        }
      });
    } catch (error) {
      console.error('Error adding wallet:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to add wallet',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Set a wallet as primary
   */
  async setPrimaryWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?._id;
      const { walletId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'Authentication required'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'User does not exist'
        });
      }

      // Handle abstract wallet case
      if (walletId === 'abstract-wallet' && user.abstractWallet?.address) {
        // Set all other wallets to non-default
        if (user.wallets) {
          user.wallets.forEach(wallet => {
            wallet.isDefault = false;
          });
        }
        
        await user.save();
        return res.json({
          success: true,
          message: 'Primary wallet updated successfully',
          data: {
            primaryWalletId: 'abstract-wallet'
          }
        });
      }

      // Find the wallet to set as primary
      const targetWallet = user.wallets?.find(w => w.id === walletId);
      if (!targetWallet) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found',
          error: 'Wallet does not exist'
        });
      }

      // Set all wallets to non-default first
      if (user.wallets) {
        user.wallets.forEach(wallet => {
          wallet.isDefault = false;
        });
      }

      // Set the target wallet as default
      targetWallet.isDefault = true;
      targetWallet.lastUsed = new Date();

      await user.save();

      return res.json({
        success: true,
        message: 'Primary wallet updated successfully',
        data: {
          primaryWalletId: walletId
        }
      });
    } catch (error) {
      console.error('Error setting primary wallet:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to set primary wallet',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Update wallet label
   */
  async updateWalletLabel(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?._id;
      const { walletId } = req.params;
      const { label } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'Authentication required'
        });
      }

      if (!label || label.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Label is required',
          error: 'Missing required field'
        });
      }

      if (label.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Label must be 50 characters or less',
          error: 'Label too long'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'User does not exist'
        });
      }

      // Cannot update abstract wallet label through this endpoint
      if (walletId === 'abstract-wallet') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update abstract wallet label',
          error: 'Invalid operation'
        });
      }

      // Find the wallet to update
      const targetWallet = user.wallets?.find(w => w.id === walletId);
      if (!targetWallet) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found',
          error: 'Wallet does not exist'
        });
      }

      targetWallet.label = label.trim();
      await user.save();

      return res.json({
        success: true,
        message: 'Wallet label updated successfully',
        data: {
          wallet: targetWallet
        }
      });
    } catch (error) {
      console.error('Error updating wallet label:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update wallet label',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Remove a wallet from user's account
   */
  async removeWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?._id;
      const { walletId } = req.params;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'Authentication required'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'User does not exist'
        });
      }

      // Cannot remove abstract wallet
      if (walletId === 'abstract-wallet') {
        return res.status(400).json({
          success: false,
          message: 'Cannot remove abstract wallet',
          error: 'Invalid operation'
        });
      }

      // Find wallet index
      const walletIndex = user.wallets?.findIndex(w => w.id === walletId);
      if (walletIndex === undefined || walletIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found',
          error: 'Wallet does not exist'
        });
      }

      const wasDefault = user.wallets![walletIndex].isDefault;

      // Remove the wallet
      user.wallets!.splice(walletIndex, 1);

      // If removed wallet was default, make the first remaining wallet default
      if (wasDefault && user.wallets!.length > 0) {
        user.wallets![0].isDefault = true;
      }

      await user.save();

      return res.json({
        success: true,
        message: 'Wallet removed successfully',
        data: {
          removedWalletId: walletId,
          newPrimaryWalletId: user.wallets!.find(w => w.isDefault)?.id || null
        }
      });
    } catch (error) {
      console.error('Error removing wallet:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to remove wallet',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Verify wallet ownership through signature
   */
  async verifyWallet(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?._id;
      const { walletId } = req.params;
      const { signature, message } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated',
          error: 'Authentication required'
        });
      }

      if (!signature || !message) {
        return res.status(400).json({
          success: false,
          message: 'Signature and message are required',
          error: 'Missing required fields'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'User does not exist'
        });
      }

      // Abstract wallet is always verified
      if (walletId === 'abstract-wallet') {
        return res.json({
          success: true,
          message: 'Abstract wallet is already verified',
          data: {
            verified: true
          }
        });
      }

      // Find the wallet to verify
      const targetWallet = user.wallets?.find(w => w.id === walletId);
      if (!targetWallet) {
        return res.status(404).json({
          success: false,
          message: 'Wallet not found',
          error: 'Wallet does not exist'
        });
      }

      // TODO: Implement actual signature verification using ethers or web3
      // For now, we'll just mark it as verified (placeholder)
      // In a real implementation, you would:
      // 1. Recover the address from the signature
      // 2. Compare with the wallet address
      // 3. Verify the message content

      // Placeholder verification (always succeeds for now)
      const isValidSignature = true; // Replace with actual verification

      if (!isValidSignature) {
        return res.status(400).json({
          success: false,
          message: 'Invalid signature',
          error: 'Signature verification failed'
        });
      }

      targetWallet.isVerified = true;
      targetWallet.lastUsed = new Date();
      await user.save();

      return res.json({
        success: true,
        message: 'Wallet verified successfully',
        data: {
          wallet: targetWallet
        }
      });
    } catch (error) {
      console.error('Error verifying wallet:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to verify wallet',
        error: 'Internal server error'
      });
    }
  }
}

export const walletController = new WalletController();