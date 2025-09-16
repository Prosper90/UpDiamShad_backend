import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import { veriffConfig, VERIFF_ENDPOINTS } from '../config/veriff';
import { logger } from '../config/logger';

export interface VeriffSessionRequest {
  verification: {
    callback?: string;
    person?: {
      firstName?: string;
      lastName?: string;
      idNumber?: string;
    };
    document?: {
      number?: string;
      type?: string;
      country?: string;
    };
    vendorData?: string;
    lang?: string;
    features?: string[];
    timestamp?: string;
  };
}

export interface VeriffSessionResponse {
  status: string;
  verification: {
    id: string;
    url: string;
    vendorData?: string;
    host: string;
    status: string;
    sessionToken?: string;
  };
}

export interface VeriffDecisionResponse {
  status: string;
  verification: {
    id: string;
    code: number;
    person: {
      firstName?: string;
      lastName?: string;
      idNumber?: string;
      dateOfBirth?: string;
      nationality?: string;
    };
    document: {
      number?: string;
      type?: string;
      country?: string;
    };
    status: string;
    acceptanceTime: string;
    decisionTime?: string;
    reason?: string;
    reasonCode?: number;
    comments?: Array<{
      content: string;
      timestamp: string;
    }>;
  };
}

export interface VeriffWebhookPayload {
  id: string;
  feature: string;
  code: number;
  action: string;
  vendorData?: string;
  verification: {
    id: string;
    status: string;
    person?: {
      firstName?: string;
      lastName?: string;
    };
    document?: {
      type?: string;
      country?: string;
    };
    decisionTime?: string;
    acceptanceTime?: string;
    reason?: string;
    reasonCode?: number;
  };
}

class VeriffService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly apiSecret: string;
  private readonly webhookSecret?: string;

  constructor() {
    this.apiKey = veriffConfig.apiKey;
    this.baseUrl = veriffConfig.baseUrl;
    this.apiSecret = veriffConfig.apiSecret;
    this.webhookSecret = veriffConfig.webhookSecret;
  }

  /**
   * Create authentication headers for Veriff API
   */
  private createAuthHeaders(payload?: string): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    
    // Create signature using HMAC-SHA256 - Veriff standard format
    // Use the Master signature key (API secret) for HMAC
    const signaturePayload = payload || '';
    
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signaturePayload)
      .digest('hex');

    logger.info('Creating Veriff auth headers:', {
      timestamp,
      apiKeyPrefix: this.apiKey.substring(0, 8),
      payloadLength: payload?.length || 0,
      signaturePrefix: signature.substring(0, 8)
    });

    return {
      'Content-Type': 'application/json',
      'X-AUTH-CLIENT': this.apiKey,
      'X-HMAC-SIGNATURE': signature,
      'X-AUTH-TIMESTAMP': timestamp
    };
  }

  /**
   * Create a new verification session
   */
  async createSession(sessionData: VeriffSessionRequest): Promise<VeriffSessionResponse> {
    try {
      const payload = JSON.stringify(sessionData);
      const headers = this.createAuthHeaders(payload);

      logger.info('Creating Veriff session:', {
        url: `${this.baseUrl}${VERIFF_ENDPOINTS.CREATE_SESSION}`,
        vendorData: sessionData.verification.vendorData
      });

      const response: AxiosResponse<VeriffSessionResponse> = await axios.post(
        `${this.baseUrl}${VERIFF_ENDPOINTS.CREATE_SESSION}`,
        sessionData,
        { headers }
      );

      logger.info('Veriff session created successfully:', {
        sessionId: response.data.verification.id,
        status: response.data.verification.status
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to create Veriff session:', {
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error(`Veriff session creation failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get verification decision
   */
  async getDecision(sessionId: string): Promise<VeriffDecisionResponse> {
    try {
      const headers = this.createAuthHeaders();
      const url = `${this.baseUrl}${VERIFF_ENDPOINTS.GET_DECISION.replace('{sessionId}', sessionId)}`;

      logger.info('Getting Veriff decision:', { sessionId, url });

      const response: AxiosResponse<VeriffDecisionResponse> = await axios.get(url, { headers });

      logger.info('Veriff decision retrieved:', {
        sessionId,
        status: response.data.verification.status,
        code: response.data.verification.code
      });

      return response.data;
    } catch (error: any) {
      logger.error('Failed to get Veriff decision:', {
        sessionId,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      throw new Error(`Veriff decision retrieval failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload: string, signature: string, timestamp: string): boolean {
    try {
      // Use webhook secret if available, otherwise use API secret
      const secret = this.webhookSecret || this.apiSecret;
      
      // Create expected signature
      const signaturePayload = secret + timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(signaturePayload)
        .digest('hex');

      // Compare signatures using constant time comparison
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Webhook signature validation error:', error);
      return false;
    }
  }

  /**
   * Process webhook payload
   */
  processWebhookPayload(payload: VeriffWebhookPayload): {
    sessionId: string;
    status: string;
    decision: string;
    reason?: string;
    completedAt?: Date;
    personId?: string;
  } {
    const verification = payload.verification;
    
    // Map Veriff status to our internal status
    let internalStatus = verification.status;
    if (verification.status === 'approved' || verification.status === 'declined') {
      internalStatus = verification.status;
    }

    return {
      sessionId: verification.id,
      status: internalStatus,
      decision: verification.status,
      reason: verification.reason,
      completedAt: verification.decisionTime ? new Date(verification.decisionTime) : undefined,
      personId: payload.id
    };
  }

  /**
   * Create session data for whitelist application
   */
  createWhitelistSessionData(
    walletAddress: string, 
    email: string, 
    callbackUrl?: string
  ): VeriffSessionRequest {
    return {
      verification: {
        callback: callbackUrl,
        vendorData: `whitelist:${walletAddress}:${email}`,
        lang: 'en',
        features: ['selfid'],
        timestamp: new Date().toISOString()
      }
    };
  }
}

export const veriffService = new VeriffService();