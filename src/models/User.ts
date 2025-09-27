import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

// InsightIQ integration interface
export interface IInsightIQIntegration {
  userId: string | null;
  external_id: string | null;
  sdkToken: string | null;
  tokenExpiresAt: Date | null;
  isConnected: boolean;
  connectedAt: Date | null;
  connectedAccounts: {
    accountId: string;
    platform: "youtube" | "tiktok" | "instagram" | "twitter" | "twitch";
    username: string;
    displayName?: string;
    profilePicture?: string;
    followerCount?: number;
    isActive: boolean;
    connectedAt: Date;
    lastSyncAt?: Date;
  }[];
  createdAt: Date;
}

// Abstract Wallet interface
export interface IAbstractWallet {
  address: string;
  privateKey: string; // Should be encrypted in production
  network: string;
  createdAt: Date;
}

// Wavz System Interfaces - All users are creators
export interface IWavzProfile {
  role: "creator"; // All users are creators by default
  sparks: number; // cPoints (non-transferable reputation)
  cPoints: number; // Cumulative weighting of sparks over time
  level: number; // Current level (1-5) - Pulse → Resonance
  levelProgress: number; // Progress to next level (0-100%)

  // Creator stats - now for all users
  creatorStats: {
    totalPosts: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number; // Instagram/TikTok saves
    totalWatchTime: number; // YouTube watch time in hours
    engagementRate: number;
    followerCount: number; // Total across all platforms
    monthlyEarnings: number;

    // Platform-specific breakdowns
    platformStats: {
      youtube: {
        likes: number;
        dislikes: number;
        comments: number;
        views: number;
        watchTime: number;
        subscribers: number;
      };
      instagram: {
        likes: number;
        comments: number;
        views: number;
        saves: number;
        shares: number;
        followers: number;
      };
      twitter: {
        likes: number;
        retweets: number;
        comments: number;
        impressions: number;
        followers: number;
      };
      tiktok: {
        likes: number;
        comments: number;
        views: number;
        shares: number;
        followers: number;
      };
      spotify: {
        streams: number;
        playlists: number;
        followers: number;
      };
    };
  };

  // Badges and achievements
  badges: string[]; // Array of badge IDs/names
  nftEvolution: {
    currentBadge: string;
    evolutionStage: number;
    nextEvolutionAt: number; // Sparks needed for next evolution
  };

  // Proof tracking
  proofStats: {
    proofOfPost: number; // PoP count
    proofOfHold: number; // PoH count
    proofOfUse: number; // PoU count
    proofOfSupport: number; // PoS count
  };

  // Beat-related stats (CORRECTED FLOW: Raw Engagement → cPoints → Sparks → Beats)
  totalBeats: number; // Count of individual creative contributions (Beats)
  beatsValue: number; // Total value accumulated from all Beats
  beatStats: {
    totalBeats: number; // Total number of Beats created
    averageBeatValue: number; // Average value per Beat
    bestPerformingBeat: string; // Beat ID of best performing Beat
    monthlyBeats: number; // Beats created this month
    lastBeatCreated: Date | null; // When last Beat was created
    trendingBeats: number; // Count of currently trending Beats
  };

  isOnboarded: boolean; // Has completed onboarding flow
  onboardedAt?: Date;
  lastActivityAt: Date;
}

// Wallet information interface
export interface IWalletInfo {
  id: string;
  address: string;
  type: "abstract" | "connected" | "external";
  provider?: string;
  label?: string; // User-defined label like "MetaMask Main", "Hardware Wallet"
  isDefault?: boolean; // Primary wallet for blockchain operations
  isVerified?: boolean; // Has completed signature verification
  createdAt: Date;
  lastUsed?: Date;
}

// Main User interface
export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  password?: string;
  displayName: string;
  username: string; // Username for @handles, profiles, etc.
  verificationLevel: string;
  abstractWallet?: IAbstractWallet; // Abstract wallet created during signup
  wallets: IWalletInfo[]; // Multiple wallet support
  wavzProfile: IWavzProfile; // Wavz system data
  insightIQ?: IInsightIQIntegration; // InsightIQ integration data
  preferences: {
    notifications: boolean;
    theme: "light" | "dark";
    language: string;
  };
  isActive: boolean;
  lastLogin: Date;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateAuthToken(): string;
  updateLastLogin(): void;
}

const UserSchema: Schema<IUser> = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },

    password: {
      type: String,
      required: false, // Optional for OAuth-only users
    },

    displayName: {
      type: String,
      required: true,
      trim: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
    },

    verificationLevel: {
      type: String,
      enum: ["unverified", "basic", "verified", "premium"],
      default: "basic",
    },

    // Abstract wallet created during signup
    abstractWallet: {
      address: {
        type: String,
        required: false,
      },
      privateKey: {
        type: String,
        required: false, // Should be encrypted in production
      },
      network: {
        type: String,
        default: "ethereum",
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },

    // Multiple wallets support
    wallets: [
      {
        id: {
          type: String,
          required: true,
          default: () => new mongoose.Types.ObjectId().toString(),
        },
        address: {
          type: String,
          required: true,
          lowercase: true,
        },
        type: {
          type: String,
          enum: ["abstract", "connected", "external"],
          required: true,
        },
        provider: {
          type: String,
          required: false,
        },
        label: {
          type: String,
          required: false,
          maxlength: 50,
        },
        isDefault: {
          type: Boolean,
          default: false,
        },
        isVerified: {
          type: Boolean,
          default: false,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        lastUsed: {
          type: Date,
          required: false,
        },
      },
    ],

    // Wavz Profile Schema - All users are creators
    wavzProfile: {
      role: {
        type: String,
        enum: ["creator"],
        default: "creator",
      },
      sparks: {
        type: Number,
        default: 0,
      },
      cPoints: {
        type: Number,
        default: 0,
      },
      level: {
        type: Number,
        default: 1,
        min: 1,
        max: 5,
      },
      levelProgress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
      },

      // Creator stats - now required for all users
      creatorStats: {
        totalPosts: { type: Number, default: 0 },
        totalViews: { type: Number, default: 0 },
        totalLikes: { type: Number, default: 0 },
        totalComments: { type: Number, default: 0 },
        totalShares: { type: Number, default: 0 },
        totalSaves: { type: Number, default: 0 },
        totalWatchTime: { type: Number, default: 0 },
        engagementRate: { type: Number, default: 0 },
        followerCount: { type: Number, default: 0 },
        monthlyEarnings: { type: Number, default: 0 },

        // Platform-specific breakdowns
        platformStats: {
          youtube: {
            likes: { type: Number, default: 0 },
            dislikes: { type: Number, default: 0 },
            comments: { type: Number, default: 0 },
            views: { type: Number, default: 0 },
            watchTime: { type: Number, default: 0 },
            subscribers: { type: Number, default: 0 },
          },
          instagram: {
            likes: { type: Number, default: 0 },
            comments: { type: Number, default: 0 },
            views: { type: Number, default: 0 },
            saves: { type: Number, default: 0 },
            shares: { type: Number, default: 0 },
            followers: { type: Number, default: 0 },
          },
          twitter: {
            likes: { type: Number, default: 0 },
            retweets: { type: Number, default: 0 },
            comments: { type: Number, default: 0 },
            impressions: { type: Number, default: 0 },
            followers: { type: Number, default: 0 },
          },
          tiktok: {
            likes: { type: Number, default: 0 },
            comments: { type: Number, default: 0 },
            views: { type: Number, default: 0 },
            shares: { type: Number, default: 0 },
            followers: { type: Number, default: 0 },
          },
          spotify: {
            streams: { type: Number, default: 0 },
            playlists: { type: Number, default: 0 },
            followers: { type: Number, default: 0 },
          },
        },
      },

      // Badges and NFT evolution
      badges: [String],
      nftEvolution: {
        currentBadge: { type: String, default: "rookie" },
        evolutionStage: { type: Number, default: 1 },
        nextEvolutionAt: { type: Number, default: 1000 },
      },

      // Proof tracking
      proofStats: {
        proofOfPost: { type: Number, default: 0 },
        proofOfHold: { type: Number, default: 0 },
        proofOfUse: { type: Number, default: 0 },
        proofOfSupport: { type: Number, default: 0 },
      },

      // Beat-related stats (CORRECTED FLOW: Raw Engagement → cPoints → Sparks → Beats)
      totalBeats: { type: Number, default: 0 }, // Count of individual creative contributions (Beats)
      beatsValue: { type: Number, default: 0 }, // Total value accumulated from all Beats
      beatStats: {
        totalBeats: { type: Number, default: 0 }, // Total number of Beats created
        averageBeatValue: { type: Number, default: 0 }, // Average value per Beat
        bestPerformingBeat: { type: String, default: "" }, // Beat ID of best performing Beat
        monthlyBeats: { type: Number, default: 0 }, // Beats created this month
        lastBeatCreated: { type: Date, default: null }, // When last Beat was created
        trendingBeats: { type: Number, default: 0 }, // Count of currently trending Beats
      },

      isOnboarded: {
        type: Boolean,
        default: false,
      },
      onboardedAt: Date,
      lastActivityAt: {
        type: Date,
        default: Date.now,
      },
    },

    // InsightIQ Integration
    insightIQ: {
      userId: {
        type: String,
        required: false,
        default: null,
      },
      external_id: {
        type: String,
        required: false,
        default: null,
      },
      sdkToken: {
        type: String,
        required: false,
        default: null,
      },
      tokenExpiresAt: {
        type: Date,
        required: false,
        default: null,
      },
      isConnected: {
        type: Boolean,
        default: false,
      },
      connectedAt: {
        type: Date,
        default: null,
      },
      connectedAccounts: [
        {
          accountId: {
            type: String,
            required: true,
          },
          platform: {
            type: String,
            enum: ["youtube", "tiktok", "instagram", "twitter", "twitch"],
            required: true,
          },
          username: {
            type: String,
            required: true,
            trim: true,
          },
          displayName: {
            type: String,
            trim: true,
          },
          profilePicture: String,
          followerCount: {
            type: Number,
            default: 0,
          },
          isActive: {
            type: Boolean,
            default: true,
          },
          connectedAt: {
            type: Date,
            default: Date.now,
          },
          lastSyncAt: Date,
        },
      ],
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },

    preferences: {
      notifications: {
        type: Boolean,
        default: true,
      },
      theme: {
        type: String,
        enum: ["light", "dark"],
        default: "dark",
      },
      language: {
        type: String,
        default: "en",
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for performance (only add indexes not covered by unique: true)
UserSchema.index({ createdAt: -1 });
UserSchema.index({ "abstractWallet.address": 1 });
UserSchema.index({ "wallets.address": 1 });
UserSchema.index({ "wallets.id": 1 });
UserSchema.index({ "insightIQ.userId": 1 });

// Hash password before saving
UserSchema.pre<IUser>("save", async function (next) {
  if (!this.isModified("password")) return next();

  if (this.password) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Instance method to compare password
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Instance method to update last login
UserSchema.methods.updateLastLogin = function (): void {
  this.lastLogin = new Date();
  this.save();
};

// Transform output to remove sensitive fields
UserSchema.methods.toJSON = function () {
  const userObject = this.toObject();
  delete userObject.password;
  // Remove sensitive InsightIQ and wallet data from API responses
  if (userObject.insightIQ) {
    delete userObject.insightIQ.external_id;
    delete userObject.insightIQ.sdkToken;
    delete userObject.insightIQ.tokenExpiresAt;
    // Keep userId as it's needed for frontend operations
    // Keep isConnected, connectedAt, connectedAccounts for UI
  }
  if (userObject.abstractWallet) {
    delete userObject.abstractWallet.privateKey;
  }
  return userObject;
};

export const User = mongoose.model<IUser>("User", UserSchema);
