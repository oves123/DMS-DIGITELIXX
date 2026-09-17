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
    await m.connect(uri, { 
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000 
    });
    isConnected = true;
    console.log('MongoDB connected successfully on the Edge');
  } catch (err: any) {
    console.error("MONGODB ERROR", {
      name: err?.name,
      message: err?.message,
      code: err?.code,
      codeName: err?.codeName,
      reason: err?.reason?.message,
      cause: err?.cause?.message,
      stack: err?.stack
    });
    throw err;
  }
};
