import mongoose, { Document, Schema } from "mongoose";

// Engagement Snapshot interface for delta tracking
export interface IEngagementSnapshot extends Document {
  userId: mongoose.Types.ObjectId;
  accountId: string;
  platform: "youtube" | "tiktok" | "instagram" | "twitter" | "twitch" | "spotify";
  syncedAt: Date;

  // Current snapshot of engagement totals
  snapshot: {
    totalLikes: number;
    totalDislikes: number;
    totalComments: number;
    totalViews: number;
    totalShares: number;
    totalSaves: number;
    totalWatchTime: number;
    totalImpressions: number;
    totalReach: number;
    totalPosts: number;
  };

  // Delta from previous snapshot (what's NEW)
  deltaFromPrevious: {
    likes: number;
    dislikes: number;
    comments: number;
    views: number;
    shares: number;
    saves: number;
    watchTime: number;
    impressions: number;
    reach: number;
    posts: number;
  };

  // Sparks and cPoints generated from this sync
  sparksGenerated: number;
  cPointsAwarded: number;

  // Metadata
  contentCount: number; // Number of posts analyzed
  syncDuration: number; // How long the sync took (ms)

  createdAt: Date;
  updatedAt: Date;
}

const EngagementSnapshotSchema: Schema<IEngagementSnapshot> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    accountId: {
      type: String,
      required: true,
      index: true,
    },

    platform: {
      type: String,
      enum: ["youtube", "tiktok", "instagram", "twitter", "twitch", "spotify"],
      required: true,
    },

    syncedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    snapshot: {
      totalLikes: { type: Number, default: 0 },
      totalDislikes: { type: Number, default: 0 },
      totalComments: { type: Number, default: 0 },
      totalViews: { type: Number, default: 0 },
      totalShares: { type: Number, default: 0 },
      totalSaves: { type: Number, default: 0 },
      totalWatchTime: { type: Number, default: 0 },
      totalImpressions: { type: Number, default: 0 },
      totalReach: { type: Number, default: 0 },
      totalPosts: { type: Number, default: 0 },
    },

    deltaFromPrevious: {
      likes: { type: Number, default: 0 },
      dislikes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      views: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      saves: { type: Number, default: 0 },
      watchTime: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      posts: { type: Number, default: 0 },
    },

    sparksGenerated: {
      type: Number,
      default: 0,
    },

    cPointsAwarded: {
      type: Number,
      default: 0,
    },

    contentCount: {
      type: Number,
      default: 0,
    },

    syncDuration: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for efficient queries
EngagementSnapshotSchema.index({ userId: 1, accountId: 1, syncedAt: -1 });
EngagementSnapshotSchema.index({ userId: 1, platform: 1, syncedAt: -1 });

export const EngagementSnapshot = mongoose.model<IEngagementSnapshot>(
  "EngagementSnapshot",
  EngagementSnapshotSchema
);
