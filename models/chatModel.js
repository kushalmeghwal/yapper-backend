import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    chatRoomId: {
        type: String,
        required: true,
        index: true
    },
    senderId: {
        type: String,
        required: true
    },
    receiverId: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    messageType: {
        type: String,
        enum: ['text', 'file'],
        default: 'text'
    },
    fileUrl: {
        type: String,
        default: null
    }
});

const chatRoomSchema = new mongoose.Schema({
    chatRoomId: {
        type: String,
        required: true,
        unique: true
    },
    participants: [{
        type: String,
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

export const Message = mongoose.model('Message', messageSchema);
export const ChatRoom = mongoose.model('ChatRoom', chatRoomSchema);