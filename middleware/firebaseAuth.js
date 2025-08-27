import admin from "../firebase.js";

export const authenticateFirebase = async (req, res, next) => {
  try {
    let idToken = null;

    // 1. If request comes from Flutter app → token will be in Authorization header
    if (req.headers.authorization?.startsWith("Bearer ")) {
      idToken = req.headers.authorization.split("Bearer ")[1];
    }

    // 2. If request comes from Web (Next.js) → token will be in HttpOnly cookie
    if (!idToken && req.cookies?.firebase_token) {
      idToken = req.cookies.firebase_token;
    }

    // 3. If still no token → unauthorized
    if (!idToken) {
      return res.status(401).json({
        success: false,
        message: "Missing Firebase ID token",
      });
    }

    // 4. Verify token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    // attach user info to request object (uid, email, etc.)
    req.firebaseUser = decodedToken;

    next();
  } catch (error) {
    console.error("Firebase Auth Error:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired Firebase ID token",
    });
  }
};
