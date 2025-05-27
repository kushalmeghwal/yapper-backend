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

export const Message = mongoose.model('Message', messageSchema);