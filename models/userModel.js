import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    nickname: {
        type: String,
        required: true,
        trim: true
    },
    username: {
        type: String,
        required: true,
        trim: true
    },
    password: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        default: "user"
    },
    firebaseUid: { 
        type: String,
        unique: true,
        sparse: true 
    }, 
});

export const User = mongoose.model.User || mongoose.model('users', userSchema);
