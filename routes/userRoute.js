import express from 'express';
import { signUp, login, updateOrCreateFirebaseUser  } from '../controllers/userController.js';
import { authenticateFirebase } from '../middleware/firebaseAuth.js';

const router = express.Router();

router.post('/signup', signUp);
router.post('/login', login);
// Firebase Auth Route
router.post('/firebase/update-profile', authenticateFirebase, updateOrCreateFirebaseUser);

export default router;
