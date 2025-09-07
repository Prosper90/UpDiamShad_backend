import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader, JwtPayload } from '../config/jwt';
import { User, IUser } from '../models/User';
import { logger } from '../config/logger';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      userId?: string;
      walletAddress?: string;
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token required'
      });
      return;
    }

    const decoded: JwtPayload = verifyToken(token);
    
    // Find user in database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
      return;
    }

    // Attach user info to request
    req.user = user;
    req.userId = user._id.toString();
    req.walletAddress = user.abstractWallet?.address;
    
    logger.info('User authenticated successfully', {
      userId: user._id,
      email: user.email,
      walletAddress: user.abstractWallet?.address
    });

    next();
  } catch (error: any) {
    logger.error('Authentication failed:', error.message);
    
    if (error.message === 'Token expired') {
      res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
      return;
    }

    if (error.message === 'Invalid token') {
      res.status(401).json({
        success: false,
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is provided, but doesn't require it
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      next();
      return;
    }

    const decoded: JwtPayload = verifyToken(token);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (user && user.isActive) {
      req.user = user;
      req.userId = user._id.toString();
      req.walletAddress = user.abstractWallet?.address;
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // For now, we'll use verification level as role
    const userRole = req.user.verificationLevel;
    
    if (!roles.includes(userRole)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

/**
 * Wallet ownership verification middleware
 */
export const requireWalletOwnership = (walletParam = 'walletAddress') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const requestedWallet = req.params[walletParam] || req.body[walletParam];
    
    if (!requestedWallet) {
      res.status(400).json({
        success: false,
        message: 'Wallet address required'
      });
      return;
    }

    // Check if user owns the requested wallet (using abstractWallet)
    const ownsWallet = req.user.abstractWallet?.address.toLowerCase() === requestedWallet.toLowerCase();
    
    if (!ownsWallet) {
      res.status(403).json({
        success: false,
        message: 'Wallet access denied'
      });
      return;
    }

    next();
  };
};

/**
 * Rate limiting by user
 */
export const rateLimitByUser = (windowMs: number, maxRequests: number) => {
  const userRequestMap = new Map<string, { count: number; resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userId) {
      next();
      return;
    }

    const now = Date.now();
    const userKey = req.userId;
    const userRequest = userRequestMap.get(userKey);

    if (!userRequest || now > userRequest.resetTime) {
      userRequestMap.set(userKey, {
        count: 1,
        resetTime: now + windowMs
      });
      next();
      return;
    }

    if (userRequest.count >= maxRequests) {
      res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        resetTime: userRequest.resetTime
      });
      return;
    }

    userRequest.count++;
    next();
  };
};

/**
 * InsightIQ verification level check
 */
export const requireVerificationLevel = (minLevel: string) => {
  const levels = ['unverified', 'basic', 'verified', 'premium'];
  const requiredLevelIndex = levels.indexOf(minLevel);
  
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const userLevelIndex = levels.indexOf(req.user.verificationLevel);
    
    if (userLevelIndex < requiredLevelIndex) {
      res.status(403).json({
        success: false,
        message: `Verification level '${minLevel}' required`,
        currentLevel: req.user.verificationLevel
      });
      return;
    }

    next();
  };
};