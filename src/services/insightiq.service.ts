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
      "IDENTITY",
      "IDENTITY.AUDIENCE",
      "ENGAGEMENT",
      "ENGAGEMENT.COMMENTS",
      "INCOME"
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
   * Uses POST /v1/accounts/{id}/disconnect as per InsightIQ API
   */
  async disconnectAccount(accountId: string): Promise<boolean> {
    try {
      await this.apiClient.post(`/v1/accounts/${accountId}/disconnect`, {});

      logger.info("Successfully disconnected account from InsightIQ:", { accountId });
      return true;
    } catch (error: any) {
      logger.error(
        "Failed to disconnect account from InsightIQ:",
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
   * Get work platform details by work platform ID
   */
  async getWorkPlatform(
    workPlatformId: string
  ): Promise<{ name: string; category: string }> {
    try {
      const response = await this.apiClient.get(
        `/v1/work-platforms/${workPlatformId}`
      );

      logger.info("Retrieved work platform details:", {
        workPlatformId,
        name: response.data.name,
      });

      return {
        name: response.data.name,
        category: response.data.category,
      };
    } catch (error: any) {
      logger.error(
        "Failed to get work platform details:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve work platform details");
    }
  }

  /**
   * Get account details by account ID
   */
  async getAccount(accountId: string): Promise<any> {
    try {
      const response = await this.apiClient.get(`/v1/accounts/${accountId}`);

      logger.info("Retrieved account details:", {
        accountId,
        platform: response.data.work_platform?.name,
        username: response.data.username,
      });

      return response.data;
    } catch (error: any) {
      logger.error(
        "Failed to get account details:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve account details");
    }
  }

  /**
   * Get content engagement metrics for a specific connected account
   * This is the main method for Sparks calculation
   */
  async getContentMetrics(
    accountId: string,
    fromDate?: string,
    limit: number = 100
  ): Promise<any> {
    try {
      const params: any = {
        account_id: accountId,
        limit: limit,
      };

      if (fromDate) {
        params.from_date = fromDate;
      }

      const response = await this.apiClient.get("/v1/social/contents", {
        params,
      });

      logger.info("Retrieved content metrics:", {
        accountId,
        contentCount: response.data.data?.length || 0,
        fromDate,
        platform: response.data.data?.[0]?.work_platform?.name || "unknown",
      });

      return response.data;
    } catch (error: any) {
      logger.error(
        "Failed to get content metrics:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve content metrics");
    }
  }

  /**
   * Get ALL content with pagination for comprehensive engagement tracking
   * Fetches all posts to ensure accurate delta calculation
   */
  async getAllContentWithEngagements(
    accountId: string,
    fromDate?: string
  ): Promise<any[]> {
    try {
      const allContent: any[] = [];
      let offset = 0;
      const limit = 100; // Max allowed by InsightIQ API
      let hasMore = true;

      logger.info("Starting paginated content fetch:", {
        accountId,
        fromDate,
        limit,
      });

      while (hasMore) {
        const params: any = {
          account_id: accountId,
          limit: limit,
          offset: offset,
        };

        if (fromDate) {
          params.from_date = fromDate;
        }

        const response = await this.apiClient.get("/v1/social/contents", {
          params,
        });

        if (response.data.data && response.data.data.length > 0) {
          allContent.push(...response.data.data);
          offset += limit;

          // If we got less than limit, we've reached the end
          if (response.data.data.length < limit) {
            hasMore = false;
          }

          logger.info("Fetched content batch:", {
            accountId,
            batchSize: response.data.data.length,
            totalSoFar: allContent.length,
            offset,
          });
        } else {
          hasMore = false;
        }

        // Safety limit: max 1000 posts per sync to avoid infinite loops
        if (allContent.length >= 1000) {
          logger.warn("Reached maximum content limit (1000 posts):", {
            accountId,
          });
          hasMore = false;
        }
      }

      logger.info("Completed paginated content fetch:", {
        accountId,
        totalContent: allContent.length,
        platform: allContent[0]?.work_platform?.name || "unknown",
      });

      return allContent;
    } catch (error: any) {
      logger.error(
        "Failed to get all content with engagements:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve all content");
    }
  }

  /**
   * Aggregate engagement metrics from content data for Sparks calculation
   */
  aggregateEngagementMetrics(contentData: any[]): any {
    const aggregated = {
      totalContent: contentData.length,
      totalLikes: 0,
      totalDislikes: 0,
      totalComments: 0,
      totalViews: 0,
      totalShares: 0,
      totalSaves: 0,
      totalWatchTime: 0,
      totalImpressions: 0,
      totalReach: 0,
      platform: contentData[0]?.work_platform?.name || "unknown",
    };

    contentData.forEach((content) => {
      const engagement = content.engagement || {};
      aggregated.totalLikes += engagement.like_count || 0;
      aggregated.totalDislikes += engagement.dislike_count || 0;
      aggregated.totalComments += engagement.comment_count || 0;
      aggregated.totalViews += engagement.view_count || 0;
      aggregated.totalShares += engagement.share_count || 0;
      aggregated.totalSaves += engagement.save_count || 0;
      aggregated.totalWatchTime += engagement.watch_time_in_hours || 0;
      aggregated.totalImpressions += engagement.impression_organic_count || 0;
      aggregated.totalReach += engagement.reach_organic_count || 0;
    });

    return aggregated;
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

  /**
   * Get profile information including follower count and reputation metrics
   * Requires IDENTITY product
   */
  async getProfile(accountId: string): Promise<any> {
    try {
      const response = await this.apiClient.get('/v1/profiles', {
        params: { account_id: accountId }
      });

      const profileData = response.data.data?.[0]; // Get first profile

      logger.info("Retrieved profile data:", {
        accountId,
        followerCount: profileData?.reputation?.follower_count,
        subscriberCount: profileData?.reputation?.subscriber_count,
        platform: profileData?.work_platform?.name
      });

      return profileData;
    } catch (error: any) {
      logger.error(
        "Failed to get profile:",
        error.response?.data || error.message
      );
      throw new Error("Failed to retrieve profile");
    }
  }

  /**
   * Enrich account data by fetching detailed information from InsightIQ API
   * This is called in the background after a Phyllo callback
   */
  async enrichAccountData(
    insightIqUserId: string,
    accountId: string
  ): Promise<void> {
    try {
      logger.info("Starting account data enrichment:", {
        insightIqUserId,
        accountId,
      });

      // Get specific account details using the correct endpoint
      let accountData;
      try {
        accountData = await this.getAccount(accountId);
      } catch (apiError: any) {
        logger.warn("Failed to fetch account details from InsightIQ API:", {
          accountId,
          error: apiError.message,
          status: apiError.response?.status,
        });
        // Don't throw - just skip enrichment if API is unavailable
        return;
      }

      if (!accountData) {
        logger.warn("Account not found in InsightIQ for enrichment:", {
          accountId,
        });
        return;
      }

      // Get profile data for follower count and reputation metrics
      let profileData;
      try {
        profileData = await this.getProfile(accountId);
      } catch (profileError: any) {
        logger.warn("Failed to fetch profile data (will use account data only):", {
          accountId,
          error: profileError.message,
        });
        // Don't return - continue with account data only
      }

      // Import User model here to avoid circular dependencies
      const { User } = await import("../models/User");

      // Find user and update account with enriched data
      const user = await User.findOne({ "insightIQ.userId": insightIqUserId });
      if (!user) {
        logger.warn(
          "User not found for account enrichment - may have been deleted:",
          { insightIqUserId }
        );
        return;
      }

      const accountIndex = user.insightIQ!.connectedAccounts.findIndex(
        (account) => account.accountId === accountId
      );

      if (accountIndex === -1) {
        logger.warn(
          "Account not found in user's connected accounts - may have been removed:",
          { accountId }
        );
        return;
      }

      // Update with enriched data from InsightIQ
      const account = user.insightIQ!.connectedAccounts[accountIndex];
      account.username =
        accountData.username ||
        accountData.platform_username ||
        account.username;
      account.displayName =
        accountData.platform_profile_name || account.displayName;
      account.profilePicture = accountData.profile_pic_url;

      // Update follower count from profile data
      if (profileData?.reputation) {
        account.followerCount =
          profileData.reputation.follower_count ||
          profileData.reputation.subscriber_count ||
          0;
      }

      account.lastSyncAt = new Date();

      await user.save();

      logger.info("Account data enrichment completed:", {
        accountId,
        username: account.username,
        displayName: account.displayName,
        followerCount: account.followerCount,
        platform: accountData.work_platform?.name,
      });
    } catch (error: any) {
      logger.warn("Account data enrichment failed (non-critical):", {
        insightIqUserId,
        accountId,
        error: error.message,
      });
      // Don't throw - this is background enrichment and shouldn't break main flow
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
