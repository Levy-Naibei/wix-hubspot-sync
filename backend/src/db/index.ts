import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

let connected = false;

export async function connectDb(): Promise<void> {
  if (connected) return;

  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected', { uri: config.mongoUri.replace(/:\/\/.*@/, '://***@') });
  });
  mongoose.connection.on('error', (err: Error) => {
    logger.error('MongoDB connection error', { message: err.message, stack: err.stack });
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected — retrying…');
    connected = false;
  });

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  });

  connected = true;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
  connected = false;
}

export { mongoose };