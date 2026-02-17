import mongoose from 'mongoose';

/**
 * Connect to MongoDB
 * Returns a promise that resolves when connected or rejects on error
 * Note: dotenv should be loaded in server.js before calling this function
 */
const connectDB = async () => {
  try {
    // Validate MONGO_URI exists
    if (!process.env.MONGO_URI) {
      throw new Error(
        'MONGO_URI is not defined in environment variables. Please check your .env file.'
      );
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000, // 10 second timeout
      socketTimeoutMS: 45000,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    throw error; // Re-throw to let caller handle it
  }
};

export default connectDB;
