import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import axios from "axios";
import { generateToken } from "../config/jwt";

const INSIGHTIQ_BASE_URL =
  process.env.INSIGHTIQ_BASE_URL || "https://api.insightiq.ai/v1";
const username = process.env.INSIGHTIQ_CLIENT_ID || "";
const password = process.env.INSIGHTIQ_CLIENT_SECRET || "";
const INSIGHTIQ_API_KEY = process.env.INSIGHTIQ_API_KEY;
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

interface InsightIQUserResponse {
  name: string;
  external_id: string;
  id: string;
  created_at: Date;
  updated_at: Date;
  status: string;
  sdkToken: string;
  error?: {
    type: string;
    error_code: string;
    code: string;
    message: string;
    status_code: number;
    http_status_code: number;
    request_id: string;
  };
}

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, displayName } = req.body;

    // Validate required fields
    if (!email || !password || !displayName) {
      res.status(400).json({
        success: false,
        message: "Email, password, and display name are required",
        error: "MISSING_FIELDS",
      });
      return;
    }

    // Validate field lengths
    if (displayName.length < 2 || displayName.length > 50) {
      res.status(400).json({
        success: false,
        message: "Display name must be between 2 and 50 characters",
        error: "INVALID_DISPLAY_NAME",
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
        error: "WEAK_PASSWORD",
      });
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({
        success: false,
        message: "User already exists with this email",
      });
      return;
    }

    // Password will be hashed by the User model's pre-save hook

    // Step 1: Create InsightIQ user
    let insightIQData: {
      name: string;
      external_id: string;
      id: string;
      created_at: Date;
      updated_at: Date;
      status: string;
      error?: {
        type: string;
        error_code: string;
        code: string;
        message: string;
        status_code: number;
        http_status_code: number;
        request_id: string;
      };
    } | null = null;
    // Step 1.5: Create InsightIQ user automatically (behind the scenes)
    try {
      const { insightIQService } = await import(
        "../services/insightiq.service"
      );

      // This will create the user and return: { id, name, external_id, created_at, updated_at }
      const insightIQUser = await insightIQService.createUser(
        displayName,
        email
      );

      console.log("InsightIQ user created successfully:", {
        email,
        insightIQUserId: insightIQUser.id,
      });

      insightIQData = {
        name: insightIQUser.name,
        id: insightIQUser.id,
        external_id: insightIQUser.external_id,
        status: "ACTIVE", // Default status since user was successfully created
        created_at: new Date(insightIQUser.created_at),
        updated_at: new Date(insightIQUser.updated_at),
      };
    } catch (error) {
      console.error("InsightIQ integration error during signup:", error);
      // Continue with signup but without InsightIQ integration
      // User can connect InsightIQ later via /api/insightiq endpoints
      insightIQData = null;
    }

    // Step 2: Create abstract wallet (placeholder for now)
    const abstractWallet = {
      address: generateWalletAddress(),
      privateKey: generatePrivateKey(), // In production, this should be encrypted
      network: "ethereum",
      createdAt: new Date(),
    };

    // Generate unique username from displayName
    const baseUsername = displayName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .substring(0, 20);
    const username = await generateUniqueUsername(baseUsername);

    // Step 3: Create user in database with all integrated data
    const newUser = new User({
      email,
      password, // Raw password - will be hashed by pre-save hook
      displayName,
      username,
      verificationLevel: "basic",
      isActive: true,
      // Store InsightIQ integration data
      insightIQ: insightIQData
        ? {
            userId: insightIQData.id,
            external_id: insightIQData.external_id,
            sdkToken: null, // Will be generated when needed via /api/insightiq/sdk-token
            isConnected: insightIQData.status === "ACTIVE",
            connectedAt: new Date(),
            connectedAccounts: [],
            createdAt: new Date(insightIQData.created_at),
          }
        : {
            userId: null,
            external_id: null,
            sdkToken: null,
            isConnected: false,
            connectedAt: null,
            connectedAccounts: [],
            createdAt: new Date(),
          },
      // Store abstract wallet
      abstractWallet,
      // Initialize Wavz profile
      wavzProfile: {
        role: null,
        sparks: 0,
        level: 1,
        levelProgress: 0,
        creatorStats: {
          totalPosts: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
          engagementRate: 0,
          fanCount: 0,
          monthlyEarnings: 0,
        },
        fanStats: {
          creatorsSupported: 0,
          totalSpent: 0,
          nftsHeld: 0,
          stakingAmount: 0,
          supportLevel: "bronze",
        },
        badges: [],
        proofStats: {
          proofOfPost: 0,
          proofOfHold: 0,
          proofOfUse: 0,
          proofOfSupport: 0,
        },
        onboardedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await newUser.save();

    // Initialize wallets array with the abstract wallet if it exists
    if (abstractWallet?.address) {
      newUser.wallets = [
        {
          id: 'abstract-wallet',
          address: abstractWallet.address.toLowerCase(),
          type: 'abstract',
          provider: 'System Generated',
          label: 'Default Wallet',
          isDefault: true,
          isVerified: true,
          createdAt: abstractWallet.createdAt,
        }
      ];
      await newUser.save();
    }

    // Generate JWT token
    const token = generateToken({
      userId: newUser._id.toString(),
      email: newUser.email,
    });

    // Return success response
    res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user: {
          id: newUser._id,
          email: newUser.email,
          displayName: newUser.displayName,
          username: newUser.username,
          verificationLevel: newUser.verificationLevel,
          wavzProfile: newUser.wavzProfile,
          insightIQ: newUser.insightIQ,
          abstractWallet: {
            address: newUser.abstractWallet?.address,
            network: newUser.abstractWallet?.network,
          },
        },
        token,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during signup",
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    console.log("=== LOGIN ATTEMPT ===");
    console.log("Email:", email, "password", password);
    console.log("Password provided:", !!password);
    console.log("Request body keys:", Object.keys(req.body));

    // Enhanced validation
    if (!email || !password) {
      console.log(
        "❌ Missing credentials - email:",
        !!email,
        "password:",
        !!password
      );
      res.status(400).json({
        success: false,
        message: "Email and password are required",
        error: "MISSING_CREDENTIALS",
      });
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log("❌ Invalid email format:", email);
      res.status(400).json({
        success: false,
        message: "Please enter a valid email address",
        error: "INVALID_EMAIL_FORMAT",
      });
      return;
    }

    console.log("✅ Input validation passed");

    // Find user
    console.log("🔍 Searching for user with email:", email);
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      console.log("❌ User not found for email:", email);
      console.log("Available users count:", await User.countDocuments());
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
        error: "USER_NOT_FOUND",
      });
      return;
    }

    console.log("✅ User found:");
    console.log("- User ID:", user._id);
    console.log("- Email:", user.email);
    console.log("- Username:", user.username);
    console.log("- Display Name:", user.displayName);
    console.log("- Has Password:", !!user.password);
    console.log("- Is Active:", user.isActive);

    // Check if user is active
    if (!user.isActive) {
      console.log("❌ User account is inactive");
      res.status(401).json({
        success: false,
        message: "Account is inactive. Please contact support.",
        error: "ACCOUNT_INACTIVE",
      });
      return;
    }

    // Check password
    console.log("🔐 Verifying password...");
    console.log("- Raw password length:", password.length);
    console.log("- Stored hash format:", user.password?.substring(0, 7));
    if (!user.password) {
      console.log("❌ User has no password set (OAuth-only account?)");
      res.status(401).json({
        success: false,
        message: "Invalid login method. Please use social login.",
        error: "NO_PASSWORD_SET",
      });
      return;
    }
    // console.log("User check", user);
    const isPasswordValid = await user.comparePassword(password);
    console.log("Password validation result:", isPasswordValid);

    if (!isPasswordValid) {
      console.log("❌ Invalid password for user:", email);
      res.status(401).json({
        success: false,
        message: "Invalid credentials",
        error: "INVALID_PASSWORD",
      });
      return;
    }

    console.log("✅ Password verification successful");

    // Update last login
    user.lastLogin = new Date();
    await user.save();
    console.log("✅ Last login updated");

    // Generate JWT token
    console.log("🎟️ Generating JWT token...");
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
    });

    console.log("✅ JWT token generated");

    // Prepare response data
    const responseData = {
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user._id,
          email: user.email,
          displayName: user.displayName,
          username: user.username,
          verificationLevel: user.verificationLevel,
          wavzProfile: user.wavzProfile,
          insightIQ: user.insightIQ,
          abstractWallet: {
            address: user.abstractWallet?.address,
            network: user.abstractWallet?.network,
          },
          preferences: user.preferences,
          lastLogin: user.lastLogin,
          createdAt: user.createdAt,
        },
        token,
      },
    };

    console.log("=== LOGIN SUCCESS ===");
    console.log("User logged in:", user.email);
    console.log("Response data keys:", Object.keys(responseData.data));

    res.json(responseData);
  } catch (error) {
    console.error("=== LOGIN ERROR ===");
    console.error("Error details:", error);
    console.error("Stack trace:", (error as Error).stack);

    res.status(500).json({
      success: false,
      message: "Internal server error during login",
      error: "SERVER_ERROR",
    });
  }
};

// Helper function to create InsightIQ user (DEPRECATED - use insightiq.service.ts instead)
/*
async function createInsightIQUser(
  email: string,
  displayName: string
): Promise<InsightIQUserResponse> {
  try {
    if (!username || !password) {
      throw new Error("Missing authentication credentials");
    }
    const credentials = Buffer.from(`${username}:${password}`).toString(
      "base64"
    );
    console.log("Generated credentials:", credentials);

    // Create user in InsightIQ
    const createUserResponse = await axios.post(
      `${INSIGHTIQ_BASE_URL}/users`,
      {
        email,
        name: displayName,
        metadata: {
          source: "diamondz_chain",
          platform: "wavz",
        },
      },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
      }
    );

    const userId = createUserResponse.data.id;

    // Generate SDK token for the user
    const tokenResponse = await axios.post(
      `${INSIGHTIQ_BASE_URL}/sdk-token`,
      {
        name: `diamondz_${Date.now()}`,
        user_id: `${userId}`,
        permissions: ["read", "analytics", "social_connect"],
      },
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      id: userId,
      external_id: createUserResponse.data.external_id,
      sdkToken: tokenResponse.data.sdk_token,
    };
  } catch (error: any) {
    console.error(
      "InsightIQ user creation error:",
      error.response?.data || error.message
    );
    return {
      error: error.response?.data?.message || error.message,
    };
  }
}
*/

// Helper function to generate unique username
async function generateUniqueUsername(baseUsername: string): Promise<string> {
  let username = baseUsername;
  let counter = 1;

  while (await User.findOne({ username })) {
    username = `${baseUsername}${counter}`;
    counter++;
  }

  return username;
}

// Helper functions for wallet generation
function generateWalletAddress(): string {
  // Generate a mock Ethereum address
  // In production, use proper wallet generation library
  const chars = "0123456789abcdef";
  let address = "0x";
  for (let i = 0; i < 40; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return address;
}

function generatePrivateKey(): string {
  // Generate a mock private key
  // In production, use proper cryptographic generation
  const chars = "0123456789abcdef";
  let key = "0x";
  for (let i = 0; i < 64; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}
