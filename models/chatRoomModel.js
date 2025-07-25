import mongoose from 'mongoose';

const chatRoomSchema = new mongoose.Schema({
    chatRoomId: {
        type: String,
        required: true,
        unique: true
    },
   participants: [{
        type: String,
        ref: 'User',
         required: true
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastMessage: {
        type: Date,
        default: Date.now
    }
});

export const ChatRoom = mongoose.model.ChatRoom || mongoose.model('ChatRoom', chatRoomSchema);
