import mongoose from 'mongoose';
const m = (mongoose as any).default || mongoose;

let isConnected = false;

export const connectDB = async (uri: string) => {
  if (isConnected) {
    return;
  }

  if (m.connection && m.connection.readyState === 1) {
    isConnected = true;
    return;
  }

  try {
    await m.connect(uri);
    isConnected = true;
    console.log('MongoDB connected successfully on the Edge');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};
