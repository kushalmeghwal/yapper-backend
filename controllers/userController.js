import {User} from '../models/userModel.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { ChatRoom } from "../models/chatRoomModel.js";
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
            { userId: user._id, nickname: user.nickname, username:user.username}, // Payload
            process.env.JWT_SECRET, // Secret key
            { expiresIn: "1d" } // Expiry
        );
        
        // Send token in HTTP-only cookie
        res.cookie('token', token, {
            httpOnly: true,  // Prevent JS access (XSS protection)
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            sameSite: 'lax', // CSRF protection
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });
        

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
export const profile=async (req,res)=>{
    
}

export const me=async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ userId: decoded.userId, nickname: decoded.nickname , username:decoded.username});
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}



// Called when user logs in via Firebase and fills nickname + username
export const updateOrCreateFirebaseUser = async (req, res) => {
  try {
    const { nickname, username } = req.body;
       let firebaseUid; 
      if (req.firebaseUser) {
      firebaseUid = req.firebaseUser.uid;   // mobile (Firebase token)
    } else if (req.user) {
      firebaseUid = req.user.id;            // web (JWT from cookie)
    }
    if (!firebaseUid) {
      return res.status(401).json({
        success: false,
        message: "No valid user found in request",
      });
    }
    if (!nickname || !username) {
      return res.status(400).json({
        success: false,
        message: "Nickname and username are required",
      });
    }

    // Check if user exists by firebaseUid
    let user = await User.findOne({ firebaseUid });

    if (!user) {
      // Check if username already taken
      const usernameTaken = await User.findOne({ username });
      if (usernameTaken) {
        return res.status(400).json({
          success: false,
          message: "Username already taken",
        });
      }

      // Create new user
      const hashedDummyPassword = await bcrypt.hash("firebaseuser", 10);
      user = await User.create({
        nickname,
        username,
        password: hashedDummyPassword,
        firebaseUid,
      });
    } else {
      // Update existing user
      user.nickname = nickname;
      user.username = username;
      await user.save();
    }

    // Create your own JWT
    const token = jwt.sign(
      { userId: user._id, nickname: user.nickname },
      process.env.JWT_SECRET,
      { expiresIn: "3d" }
    );

    console.log("User created via Firebase successfully");

    // Detect if request is from web or mobile
    const userAgent = req.headers["user-agent"] || "";
    const isWeb = userAgent.includes("Mozilla"); // crude but works for browsers

    if (isWeb) {
      // 👉 Web: send token as HttpOnly cookie
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000, // 1 days
      });

      return res.status(200).json({
        success: true,
        message: "User profile updated successfully (web)",
        userId: user._id,
      });
    } else {
      // 👉 Mobile App: return token in JSON
      return res.status(200).json({
        success: true,
        message: "User profile updated successfully (app)",
        token,
        userId: user._id,
      });
    }
  } catch (err) {
    console.error("Update Firebase User Error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating user",
    });
  }
};



export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.uid; // comes from Firebase via authenticateFirebase
    const { nickname, username } = req.body;

    if (!nickname || !username) {
      return res.status(400).json({ message: "Nickname and Username are required" });
    }

    // check if username is already taken by another user
    const existingUser = await User.findOne({
      username,
      firebaseUid: { $ne: userId } // check against firebaseUid instead of _id
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username already taken" });
    }

    // update user profile
    const updatedUser = await User.findOneAndUpdate(
      { firebaseUid: userId }, // match by firebaseUid
      { nickname, username },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
