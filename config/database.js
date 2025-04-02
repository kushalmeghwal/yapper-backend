import mongoose from 'mongoose';
import 'dotenv/config';

const connectDB =mongoose.connect(process.env.DATABASE_URI);
    try {
        console.log('DB connected successfully');
    } catch (err) {
        console.error('DB connection failed:', err);
        process.exit(1);
    }


export default connectDB;
