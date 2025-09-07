import mongoose from 'mongoose';
import { logger } from './logger';

export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/diamondz';
    
    logger.info('Attempting to connect to MongoDB...', { 
      uri: mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') // Hide credentials in logs
    });

    // Configure connection options
    const options = {
      connectTimeoutMS: 10000, // 10 second timeout
      serverSelectionTimeoutMS: 10000, // 10 second timeout  
    };
    
    const conn = await mongoose.connect(mongoUri, options);
    
    logger.info(`MongoDB Connected: ${conn.connection.host}`);
    
    // Handle connection events
    mongoose.connection.on('error', (err) => {
      logger.error('MongoDB connection error:', err);
    });
    
    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB disconnected');
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed through app termination');
      process.exit(0);
    });
    
  } catch (error: any) {
    logger.error('Error connecting to MongoDB:', {
      message: error.message,
      code: error.code,
      name: error.name
    });
    
    // Don't exit immediately - let the server start but log the error
    logger.warn('MongoDB connection failed - server starting without database');
    
    // Optionally, you could still exit if database is critical:
    // process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error disconnecting from MongoDB:', error);
  }
};