import mongoose from 'mongoose';
const m = (mongoose as any).default || mongoose;

let connectionPromise: Promise<any> | null = null;

export const connectDB = async (uri: string) => {
  if (m.connection && m.connection.readyState === 1) {
    return;
  }

  if (!connectionPromise) {
    connectionPromise = m.connect(uri, { 
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 1,
      minPoolSize: 0
    }).then(() => {
      console.log('MongoDB connected successfully on the Edge');
    }).catch((err: any) => {
      connectionPromise = null;
      throw err;
    });
  }

  try {
    await connectionPromise;
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
