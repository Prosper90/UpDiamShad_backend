import axios, { AxiosInstance } from "axios";
import { logger } from "../config/logger";
import { IInsightIQIntegration } from "../models/User";

// InsightIQ API interfaces (from official documentation)
interface InsightIQCreateUserRequest {
  name: string;
  external_id: string;
}

interface InsightIQCreateUserResponse {
  id: string;
  name: string;
  external_id: string;
  created_at: string;
  updated_at: string;
}

interface InsightIQSDKTokenRequest {
  user_id: string;
  products: string[]; // ['IDENTITY', 'ENGAGEMENT', 'CONTENTS', etc.]
}

interface InsightIQSDKTokenResponse {
  sdk_token: string;
  expires_at: string;
}

interface InsightIQAccount {
  account_id: string;
  platform: string;
  username: string;
  display_name: string;
  profile_picture?: string;
  follower_count?: number;
  is_connected: boolean;
  connected_at: string;
}

interface InsightIQAccountsResponse {
  accounts: InsightIQAccount[];
  count: number;
}

interface InsightIQMetricsResponse {
  account_id: string;
  platform: string;
  metrics: {
    followers: number;
    engagement_rate: number;
    total_posts: number;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
  };
  period: string;
  updated_at: string;
}

class InsightIQService {
  private apiClient: AxiosInstance;
  private baseUrl: string;
  private clientId: string;
  private clientSecret: string;

  constructor() {
    this.baseUrl =
      process.env.INSIGHTIQ_BASE_URL || "https://api.sandbox.insightiq.ai";
    this.clientId = process.env.INSIGHTIQ_CLIENT_ID || "";
    this.clientSecret = process.env.INSIGHTIQ_CLIENT_SECRET || "";

    // Create Basic Auth credentials (client_id:client_secret)
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
        "User-Agent": "Diamondz-Backend/1.0",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.apiClient.interceptors.request.use(
      (config) => {
        logger.info(
          `InsightIQ API Request: ${config.method?.toUpperCase()} ${config.url}`
        );
        return config;
      },
      (error) => {
        logger.error("InsightIQ API Request Error:", error);
        return Promise.reject(error);
      }
    );

    this.apiClient.interceptors.response.use(
      (response) => {
        logger.info(
          `InsightIQ API Response: ${response.status} ${response.config.url}`
        );
        return response;
      },
      (error) => {
        logger.error("InsightIQ API Response Error:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          data: error.response?.data,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new user in InsightIQ (following official documentation)
   */
  async createUser(
    name: string,
    externalId: string
  ): Promise<InsightIQCreateUserResponse> {
    try {
      const requestData: InsightIQCreateUserRequest = {
        name: name,
        external_id: externalId,
      };

      const response = await this.apiClient.post("/v1/users", requestData);

      logger.info("Successfully created InsightIQ user:", {
        name,
        externalId,
        insightIqUserId: response.data.id,
      });

      return response.data as InsightIQCreateUserResponse;
    } catch (error: any) {
      logger.error(
        "Failed to create InsightIQ user:",
        error.response?.data || error.message
      );
      throw new Error("InsightIQ user creation failed");
    }
  }

  /**
   * Check if an SDK token is still valid
   */
  isTokenValid(tokenExpiresAt: Date | string | null): boolean {
    if (!tokenExpiresAt) return false;

    const expirationDate = new Date(tokenExpiresAt);
    const now = new Date();

    // Add 5 minute buffer to avoid edge cases
    const bufferMs = 5 * 60 * 1000;
    return expirationDate.getTime() > now.getTime() + bufferMs;
  }

  /**
   * Generate SDK token for frontend Connect modal (using your original format)
   */
  async generateSDKToken(
    userId: string,
    products: string[] = [
      "INCOME",
      "ENGAGEMENT",
      "ENGAGEMENT_AUDIENCE",
      "IDENTITY",
    ]
  ): Promise<InsightIQSDKTokenResponse> {
    try {
      const requestData: InsightIQSDKTokenRequest = {
        user_id: userId,
        products,
      };

      const response = await this.apiClient.post("/v1/sdk-tokens", requestData);

      logger.info("Successfully generated SDK token:", {
        userId,
        expiresAt: response.data.expires_at,
      });

      return response.data as InsightIQSDKTokenResponse;
    } catch (error: any) {
      logger.error(
        "Failed to generate SDK token:",
        error.response?.data || error.message
      );
      throw new Error("InsightIQ SDK token generation failed");
    }
  }

  /**
   * Get all connected accounts for a user
   */
  async getConnectedAccounts(
    insightIqUserId: string
  ): Promise<InsightIQAccount[]> {
    try {
      const response = await this.apiClient.get(
        `/v1/users/accounts?user_id=${insightIqUserId}`
      );

      const accountsResponse = response.data as InsightIQAccountsResponse;

      logger.info("Retrieved connected accounts:", {
        insightIqUserId,
        accountCount: accountsResponse.count,
      });

      return accountsResponse.accounts;
    } catch (error: any) {
      logger.error(
        "Failed to get connected accounts:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve connected accounts");
    }
  }

  /**
   * Get metrics for a specific account
   */
  async getAccountMetrics(
    accountId: string,
    period: string = "last_30_days"
  ): Promise<InsightIQMetricsResponse> {
    try {
      const response = await this.apiClient.get(
        `/v1/accounts/analytics?account_id=${accountId}`,
        {
          params: { period },
        }
      );

      logger.info("Retrieved account metrics:", {
        accountId,
        period,
        followers: response.data.metrics?.followers,
      });

      return response.data as InsightIQMetricsResponse;
    } catch (error: any) {
      logger.error(
        "Failed to get account metrics:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve account metrics");
    }
  }

  /**
   * Disconnect a social media account
   */
  async disconnectAccount(accountId: string): Promise<boolean> {
    try {
      await this.apiClient.delete(`/v1/accounts/${accountId}`);

      logger.info("Successfully disconnected account:", { accountId });
      return true;
    } catch (error: any) {
      logger.error(
        "Failed to disconnect account:",
        error.response?.data || error.message
      );
      return false;
    }
  }

  /**
   * Get or create a valid SDK token for a user
   * Checks existing token validity first before creating a new one
   */
  async getOrCreateSDKToken(
    currentToken: string | null,
    tokenExpiresAt: Date | null,
    insightIqUserId: string,
    products: string[] = [
      "INCOME",
      "ENGAGEMENT",
      "ENGAGEMENT_AUDIENCE",
      "IDENTITY",
    ]
  ): Promise<{ token: string; expiresAt: Date; isNew: boolean }> {
    // Check if current token is still valid
    if (currentToken && this.isTokenValid(tokenExpiresAt)) {
      logger.info("Using existing valid SDK token:", {
        insightIqUserId,
        expiresAt: tokenExpiresAt,
      });
      return {
        token: currentToken,
        expiresAt: new Date(tokenExpiresAt!),
        isNew: false,
      };
    }

    // Generate new token if current one is invalid or doesn't exist
    logger.info("Generating new SDK token:", {
      insightIqUserId,
      reason: !currentToken ? "No existing token" : "Token expired",
    });

    const tokenResponse = await this.generateSDKToken(
      insightIqUserId,
      products
    );
    return {
      token: tokenResponse.sdk_token,
      expiresAt: new Date(tokenResponse.expires_at),
      isNew: true,
    };
  }

  /**
   * Get user details from InsightIQ
   */
  async getUser(insightIqUserId: string): Promise<any> {
    try {
      const response = await this.apiClient.get(`/v1/users/${insightIqUserId}`);

      logger.info("Retrieved InsightIQ user details:", { insightIqUserId });
      return response.data;
    } catch (error: any) {
      logger.error(
        "Failed to get user details:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve user details");
    }
  }
}

export const insightIQService = new InsightIQService();
export {
  InsightIQCreateUserResponse,
  InsightIQSDKTokenResponse,
  InsightIQAccount,
  InsightIQAccountsResponse,
  InsightIQMetricsResponse,
};
