const mongoose = require('mongoose');

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
     // img,
    type: {
        type: String,
        default: "user"
    }
});

module.exports = mongoose.model('User', userSchema);
