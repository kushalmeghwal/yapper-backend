import jwt from "jsonwebtoken";

// Used for all other protected routes after user is created
export const authMiddleware = (req, res, next) => {
  try {
    let token;

    // Flutter App → Bearer token
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Web → HttpOnly cookie
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // attach decoded payload
    next();
  } catch (err) {
    console.error("JWT Auth Error:", err.message);
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
