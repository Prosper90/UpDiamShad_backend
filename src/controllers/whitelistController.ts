import { Request, Response } from 'express';
import { Whitelist, IWhitelistEntry } from '../models/Whitelist';
import { validationResult } from 'express-validator';

export class WhitelistController {
  /**
   * Submit a new whitelist entry
   */
  async submitEntry(req: Request, res: Response) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { wallet_address, email, reason, twitter, discord, is_kyc_verified } = req.body;

      // Check if wallet address already exists
      const existingEntry = await Whitelist.findOne({ 
        wallet_address: wallet_address.toLowerCase() 
      });

      if (existingEntry) {
        return res.status(409).json({
          success: false,
          message: 'This wallet address has already been submitted to the whitelist'
        });
      }

      // Check if email already exists
      const existingEmail = await Whitelist.findOne({ 
        email: email.toLowerCase() 
      });

      if (existingEmail) {
        return res.status(409).json({
          success: false,
          message: 'This email address has already been used for whitelist submission'
        });
      }

      // Create new whitelist entry
      const whitelistEntry = new Whitelist({
        wallet_address: wallet_address.toLowerCase(),
        email: email.toLowerCase(),
        reason: reason?.trim() || undefined,
        twitter: twitter?.trim() || undefined,
        discord: discord?.trim() || undefined,
        is_kyc_verified: is_kyc_verified || false,
        status: 'pending'
      });

      await whitelistEntry.save();

      return res.status(201).json({
        success: true,
        message: 'Successfully submitted to whitelist! You will receive validator NFT airdrops once available.',
        data: {
          id: whitelistEntry._id,
          wallet_address: whitelistEntry.wallet_address,
          email: whitelistEntry.email,
          status: whitelistEntry.status,
          submitted_at: whitelistEntry.submitted_at
        }
      });
    } catch (error) {
      console.error('Error submitting whitelist entry:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit whitelist entry',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get all whitelist entries (admin only)
   */
  async getAllEntries(req: Request, res: Response) {
    try {
      const { page = 1, limit = 50, status, search } = req.query;
      
      const query: any = {};
      
      // Filter by status if provided
      if (status && ['pending', 'approved', 'rejected'].includes(status as string)) {
        query.status = status;
      }

      // Search functionality
      if (search) {
        query.$or = [
          { wallet_address: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const [entries, total] = await Promise.all([
        Whitelist.find(query)
          .sort({ submitted_at: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Whitelist.countDocuments(query)
      ]);

      return res.json({
        success: true,
        message: 'Whitelist entries retrieved successfully',
        data: {
          entries,
          pagination: {
            current_page: pageNum,
            total_pages: Math.ceil(total / limitNum),
            total_entries: total,
            per_page: limitNum
          }
        }
      });
    } catch (error) {
      console.error('Error retrieving whitelist entries:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve whitelist entries',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get whitelist statistics
   */
  async getStats(req: Request, res: Response) {
    try {
      const [totalStats, statusStats] = await Promise.all([
        Whitelist.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              withEmail: { $sum: { $cond: [{ $ne: ['$email', null] }, 1, 0] } },
              withReason: { $sum: { $cond: [{ $ne: ['$reason', null] }, 1, 0] } },
              withTwitter: { $sum: { $cond: [{ $ne: ['$twitter', null] }, 1, 0] } },
              withDiscord: { $sum: { $cond: [{ $ne: ['$discord', null] }, 1, 0] } },
              kycVerified: { $sum: { $cond: ['$is_kyc_verified', 1, 0] } }
            }
          }
        ]),
        Whitelist.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ])
      ]);

      const stats = totalStats[0] || {
        total: 0,
        withEmail: 0,
        withReason: 0,
        withTwitter: 0,
        withDiscord: 0,
        kycVerified: 0
      };

      const statusBreakdown = statusStats.reduce((acc: any, item: any) => {
        acc[item._id] = item.count;
        return acc;
      }, { pending: 0, approved: 0, rejected: 0 });

      // Configuration for whitelist limits
      const config = {
        maxWhitelistSpots: 1000, // This can be made configurable
        saleDate: 'TBA',
        tokenPrice: '$0.05',
        minPurchase: '$100',
        maxPurchase: '$5,000'
      };

      const progress = stats.total > 0 ? (stats.total / config.maxWhitelistSpots) * 100 : 0;

      return res.json({
        success: true,
        message: 'Whitelist statistics retrieved successfully',
        data: {
          total: stats.total,
          withEmail: stats.withEmail,
          withReason: stats.withReason,
          withTwitter: stats.withTwitter,
          withDiscord: stats.withDiscord,
          kycVerified: stats.kycVerified,
          statusBreakdown,
          config,
          progress: Math.min(progress, 100)
        }
      });
    } catch (error) {
      console.error('Error retrieving whitelist statistics:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve whitelist statistics',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Update whitelist entry status (admin only)
   */
  async updateStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be pending, approved, or rejected'
        });
      }

      const entry = await Whitelist.findByIdAndUpdate(
        id,
        { status, updated_at: new Date() },
        { new: true }
      );

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Whitelist entry not found'
        });
      }

      return res.json({
        success: true,
        message: 'Whitelist entry status updated successfully',
        data: entry
      });
    } catch (error) {
      console.error('Error updating whitelist entry status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update whitelist entry status',
        error: 'Internal server error'
      });
    }
  }

  /**
   * Delete whitelist entry (admin only)
   */
  async deleteEntry(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const entry = await Whitelist.findByIdAndDelete(id);

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: 'Whitelist entry not found'
        });
      }

      return res.json({
        success: true,
        message: 'Whitelist entry deleted successfully',
        data: { deletedId: id }
      });
    } catch (error) {
      console.error('Error deleting whitelist entry:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete whitelist entry',
        error: 'Internal server error'
      });
    }
  }
}

export const whitelistController = new WhitelistController();