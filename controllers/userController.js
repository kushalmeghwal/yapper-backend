import {User} from '../models/userModel.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';


// User Signup
export const signUp=async (req, res)=> {
    try {
        const { nickname, username, password } = req.body;
        console.log('User details received:', nickname, username, password);

        // Check if user already exists
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            console.log('user already exists');
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
            message: 'User created successfully',
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
export const login=async (req, res)=> {
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
            { userId: user._id, nickname: user.nickname }, // Payload
            process.env.JWT_SECRET, // Secret key
            { expiresIn: "1d" } // Expiry
        );


        console.log('user login successfully');
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token:token,
            userId: user._id,
        });
    } catch (err) {
        console.error('Error:', err);
        return res.status(500).json({
            success: false,
            message: 'Login failed due to some error',
            error: err.message,
        });
    }
}

// Called when user logs in via Firebase and fills nickname + username
export const updateOrCreateFirebaseUser = async (req, res) => {
  try {
    const { nickname, username } = req.body;
    const firebaseUser = req.firebaseUser; // Comes from middleware
    const firebaseUid = firebaseUser.uid;

    if (!nickname || !username) {
      return res.status(400).json({
        success: false,
        message: 'Nickname and username are required',
      });
    }

    // Check if a user with this firebaseUid exists
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      // Check if username already taken
      const usernameTaken = await User.findOne({ username });
      if (usernameTaken) {
        return res.status(400).json({
          success: false,
          message: 'Username already taken',
        });
      }

      // Create new user
      const hashedDummyPassword = await bcrypt.hash("firebaseuser", 10);
      user = await User.create({
        nickname,
        username,
        password: hashedDummyPassword,
        firebaseUid
      });

    } else {
      // Update existing user
      user.nickname = nickname;
      user.username = username;
      await user.save();
    }

    const token = jwt.sign(
      { userId: user._id, nickname: user.nickname },
      process.env.JWT_SECRET,
      { expiresIn: "3d" }
    );
   console.log("user created  or updated via firebase and update nickname and username successfully");
    return res.status(200).json({
      success: true,
      message: 'User profile updated successfully',
      token,
      userId: user._id,
    });

  } catch (err) {
    console.error("Update Firebase User Error:", err);
    return res.status(500).json({
      success: false,
      message: 'Something went wrong while updating user',
    });
  }
}
