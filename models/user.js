const mongoose = require("mongoose");

const userSchema = mongoose.Schema(
    {
        nickname: {
            type: String,
            required: true,
            trim: true
        },
        username: {
            type: String,
            require: true,
            trim: true
        },
        password: {
            required: true,
            type: String,
            validate: {
                validator: (value) => {
                    return value.length > 7
                },
                message: "Invalid password!"
            }
        },
        // img,
        type: {
            type: String,
            default: "user"
        }
    }
);



const User = mongoose.model("User", userSchema);
module.exports = User;