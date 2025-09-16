import { Request, Response } from 'express';
import { veriffService } from '../services/veriffService';
import { Whitelist } from '../models/Whitelist';
import { logger } from '../config/logger';
import { validateVeriffConfig } from '../config/veriff';

export class VeriffController {
  /**
   * Create a new Veriff verification session
   */
  async createSession(req: Request, res: Response) {
    try {
      // Validate Veriff configuration
      if (!validateVeriffConfig()) {
        return res.status(500).json({
          success: false,
          message: 'Veriff service is not properly configured. Missing API Secret for HMAC authentication.',
          debug: 'Please check your Veriff dashboard for API Secret (different from API Key)'
        });
      }

      const { walletAddress, email } = req.body;

      if (!walletAddress || !email) {
        return res.status(400).json({
          success: false,
          message: 'Wallet address and email are required'
        });
      }

      // Check if there's already an active verification session
      const existingEntry = await Whitelist.findOne({ 
        wallet_address: walletAddress.toLowerCase(),
        veriff_status: { $in: ['created', 'started', 'submitted'] }
      });

      if (existingEntry && existingEntry.veriff_session_url) {
        return res.json({
          success: true,
          message: 'Active verification session found',
          data: {
            sessionId: existingEntry.veriff_session_id,
            sessionUrl: existingEntry.veriff_session_url,
            status: existingEntry.veriff_status
          }
        });
      }

      // Create callback URL for webhooks (optional for development)
      const callbackUrl = process.env.NODE_ENV === 'production' 
        ? `${process.env.BACKEND_URL}/api/veriff/webhook`
        : undefined; // Skip callback URL in development

      // Create session data
      const sessionData = veriffService.createWhitelistSessionData(
        walletAddress,
        email,
        callbackUrl
      );

      // Create session with Veriff
      const veriffResponse = await veriffService.createSession(sessionData);

      // Update or create whitelist entry with Veriff session info
      const updateData = {
        veriff_session_id: veriffResponse.verification.id,
        veriff_session_url: veriffResponse.verification.url,
        veriff_status: 'created' as const,
        updated_at: new Date()
      };

      let whitelistEntry;
      if (existingEntry) {
        // Update existing entry
        whitelistEntry = await Whitelist.findByIdAndUpdate(
          existingEntry._id,
          updateData,
          { new: true }
        );
      } else {
        // Create new entry
        whitelistEntry = new Whitelist({
          wallet_address: walletAddress.toLowerCase(),
          email: email.toLowerCase(),
          is_kyc_verified: false,
          status: 'pending',
          ...updateData
        });
        await whitelistEntry.save();
      }

      logger.info('Veriff session created for whitelist:', {
        walletAddress: walletAddress.toLowerCase(),
        sessionId: veriffResponse.verification.id,
        status: veriffResponse.verification.status
      });

      return res.status(201).json({
        success: true,
        message: 'Verification session created successfully',
        data: {
          sessionId: veriffResponse.verification.id,
          sessionUrl: veriffResponse.verification.url,
          status: 'created'
        }
      });

    } catch (error: any) {
      logger.error('Error creating Veriff session:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create verification session',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get verification status
   */
  async getSessionStatus(req: Request, res: Response) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      // Find whitelist entry by session ID
      const whitelistEntry = await Whitelist.findOne({ veriff_session_id: sessionId });

      if (!whitelistEntry) {
        return res.status(404).json({
          success: false,
          message: 'Verification session not found'
        });
      }

      // If verification is still pending, try to get latest status from Veriff
      if (whitelistEntry.veriff_status && ['created', 'started', 'submitted'].includes(whitelistEntry.veriff_status)) {
        try {
          const veriffDecision = await veriffService.getDecision(sessionId);
          
          // Update local status if Veriff has new information
          if (veriffDecision.verification.status !== whitelistEntry.veriff_status) {
            whitelistEntry.veriff_status = veriffDecision.verification.status as any;
            whitelistEntry.veriff_decision = veriffDecision.verification.status;
            whitelistEntry.veriff_reason = veriffDecision.verification.reason;
            
            if (veriffDecision.verification.decisionTime) {
              whitelistEntry.veriff_completed_at = new Date(veriffDecision.verification.decisionTime);
            }
            
            // Update KYC verification status
            whitelistEntry.is_kyc_verified = veriffDecision.verification.status === 'approved';
            
            whitelistEntry.updated_at = new Date();
            await whitelistEntry.save();
          }
        } catch (veriffError) {
          logger.warn('Failed to get updated status from Veriff:', {
            sessionId,
            error: veriffError
          });
          // Continue with local status
        }
      }

      return res.json({
        success: true,
        message: 'Session status retrieved successfully',
        data: {
          sessionId: whitelistEntry.veriff_session_id,
          status: whitelistEntry.veriff_status,
          decision: whitelistEntry.veriff_decision,
          reason: whitelistEntry.veriff_reason,
          isKycVerified: whitelistEntry.is_kyc_verified,
          completedAt: whitelistEntry.veriff_completed_at,
          sessionUrl: whitelistEntry.veriff_session_url
        }
      });

    } catch (error: any) {
      logger.error('Error getting session status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get session status',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Handle Veriff webhook
   */
  async handleWebhook(req: Request, res: Response) {
    try {
      const signature = req.headers['x-hmac-signature'] as string;
      const timestamp = req.headers['x-auth-timestamp'] as string;
      const payload = JSON.stringify(req.body);

      if (!signature || !timestamp) {
        logger.warn('Veriff webhook missing required headers');
        return res.status(400).json({
          success: false,
          message: 'Missing required webhook headers'
        });
      }

      // Validate webhook signature
      const isValidSignature = veriffService.validateWebhookSignature(payload, signature, timestamp);
      
      if (!isValidSignature) {
        logger.warn('Invalid Veriff webhook signature');
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook signature'
        });
      }

      // Process webhook payload
      const webhookData = veriffService.processWebhookPayload(req.body);
      
      logger.info('Processing Veriff webhook:', {
        sessionId: webhookData.sessionId,
        status: webhookData.status,
        decision: webhookData.decision
      });

      // Find and update whitelist entry
      const whitelistEntry = await Whitelist.findOne({ 
        veriff_session_id: webhookData.sessionId 
      });

      if (!whitelistEntry) {
        logger.warn('Whitelist entry not found for Veriff session:', {
          sessionId: webhookData.sessionId
        });
        return res.status(404).json({
          success: false,
          message: 'Whitelist entry not found'
        });
      }

      // Update whitelist entry with verification results
      whitelistEntry.veriff_status = webhookData.status as any;
      whitelistEntry.veriff_decision = webhookData.decision;
      whitelistEntry.veriff_reason = webhookData.reason;
      whitelistEntry.veriff_completed_at = webhookData.completedAt || new Date();
      whitelistEntry.veriff_person_id = webhookData.personId;

      // Update KYC verification status
      whitelistEntry.is_kyc_verified = webhookData.status === 'approved';
      
      // Update whitelist status based on verification result
      if (webhookData.status === 'approved') {
        whitelistEntry.status = 'pending'; // Ready for admin approval
      } else if (webhookData.status === 'declined') {
        whitelistEntry.status = 'rejected';
      }

      whitelistEntry.updated_at = new Date();
      await whitelistEntry.save();

      logger.info('Whitelist entry updated from Veriff webhook:', {
        walletAddress: whitelistEntry.wallet_address,
        sessionId: webhookData.sessionId,
        verificationStatus: webhookData.status,
        kycVerified: whitelistEntry.is_kyc_verified
      });

      // TODO: Send notification to user about verification result
      // TODO: Trigger any post-verification workflows

      return res.json({
        success: true,
        message: 'Webhook processed successfully'
      });

    } catch (error: any) {
      logger.error('Error processing Veriff webhook:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to process webhook',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get verification statistics (admin)
   */
  async getVerificationStats(req: Request, res: Response) {
    try {
      const stats = await Whitelist.aggregate([
        {
          $group: {
            _id: '$veriff_status',
            count: { $sum: 1 }
          }
        }
      ]);

      const totalVerifications = await Whitelist.countDocuments({ 
        veriff_session_id: { $exists: true } 
      });

      const kycVerifiedCount = await Whitelist.countDocuments({ 
        is_kyc_verified: true 
      });

      const statsMap = stats.reduce((acc: any, item: any) => {
        acc[item._id || 'no_verification'] = item.count;
        return acc;
      }, {});

      return res.json({
        success: true,
        message: 'Verification statistics retrieved successfully',
        data: {
          total_verifications: totalVerifications,
          kyc_verified: kycVerifiedCount,
          verification_breakdown: statsMap,
          success_rate: totalVerifications > 0 
            ? Math.round((kycVerifiedCount / totalVerifications) * 100) 
            : 0
        }
      });

    } catch (error: any) {
      logger.error('Error getting verification stats:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get verification statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

export const veriffController = new VeriffController();