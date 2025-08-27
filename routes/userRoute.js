import express from 'express';
import admin from '../firebase.js'
import { signUp, login, updateOrCreateFirebaseUser ,me,profile,updateProfile } from '../controllers/userController.js';
import { authenticateFirebase } from '../middleware/firebaseAuth.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signUp);
router.post('/login',login);
router.get('/me', authMiddleware, me);

// Firebase Auth Route
router.post('/firebase/update-profile', authenticateFirebase, updateOrCreateFirebaseUser);
router.put('/profile',authMiddleware, profile);
router.put('/update-profile',authenticateFirebase,updateProfile);


export default router;


