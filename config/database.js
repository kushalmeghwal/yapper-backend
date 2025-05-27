import mongoose from 'mongoose';
import 'dotenv/config';
let connectDB;
try {
 connectDB =mongoose.connect(process.env.DATABASE_URI);
console.log('DB connected successfully');
} catch (err) {
        console.error('DB connection failed:', err);
        process.exit(1);
    }


export default connectDB;
