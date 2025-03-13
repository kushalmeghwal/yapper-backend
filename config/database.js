const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.DATABASE_URI, {});
        console.log('DB connected successfully');
    } catch (err) {
        console.error('DB connection failed:', err);
        process.exit(1);
    }
};

module.exports = connectDB;
