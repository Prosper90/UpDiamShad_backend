import jwt from 'jsonwebtoken';
import { logger } from './logger';

export interface JwtPayload {
  userId: string;
  email: string;
  walletAddress?: string;
  iat?: number;
  exp?: number;
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_EXPIRE: string | number = process.env.JWT_EXPIRE || '24h';

export const generateToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  try {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRE,
      issuer: 'diamondz-backend',
      audience: 'diamondz-frontend'
    } as jwt.SignOptions);
  } catch (error) {
    logger.error('Error generating JWT token:', error);
    throw new Error('Token generation failed');
  }
};

export const verifyToken = (token: string): JwtPayload => {
  try {
    const options: jwt.VerifyOptions = {
      issuer: 'diamondz-backend',
      audience: 'diamondz-frontend'
    };
    
    const decoded = jwt.verify(token, JWT_SECRET, options) as JwtPayload;
    
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.NotBeforeError) {
      throw new Error('Token not active');
    }
    
    logger.error('Error verifying JWT token:', error);
    throw new Error('Token verification failed');
  }
};

export const refreshToken = (payload: Omit<JwtPayload, 'iat' | 'exp'>): string => {
  return generateToken(payload);
};

export const extractTokenFromHeader = (authHeader: string | undefined): string | null => {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};