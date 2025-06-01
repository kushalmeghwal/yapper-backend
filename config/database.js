import mongoose from 'mongoose';
import 'dotenv/config';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URI);
    console.log('DB connected successfully');
  } catch (err) {
    console.error('DB connection failed:', err);
    process.exit(1);
  }
};

export default connectDB;
