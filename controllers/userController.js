const User = require('../models/userModel');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// User Signup
async function signUp(req, res) {
    try {
        const { nickname, username, password } = req.body;
        console.log('User details received:', nickname, username, password);

        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists',
            });
        }

        // Hash password
        let hashedPassword;
        try {
            hashedPassword = await bcrypt.hash(password, 10);
        } catch (err) {
            return res.status(500).json({
                success: false,
                message: 'Error while hashing password'
            });
        }

        // Create user in database
        const user = await User.create({
            nickname,
            username,
            password: hashedPassword
        });
        console.log('User created:', user);

        return res.status(200).json({
            success: true,
            message: 'User created successfully'
        });

    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({
            success: false,
            message: 'User cannot be registered, try again later'
        });
    }
}

// User Login
async function login(req, res) {
    try {
        const { username, password } = req.body;

        // Check for missing fields
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please fill all the entries'
            });
        }

        // Find user in database
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User is not registered'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(403).json({
                success: false,
                message: 'Incorrect password',
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { id: user._id, nickname: user.nickname },//payload
            process.env.JWT_SECRET,//jwt secret key
            { expiresIn: '2h' }//time
        );

        // Set cookie with token
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 2 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
        });

    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({
            success: false,
            message: 'Login failed due to some error'
        });
    }
}

module.exports = { signUp, login };
