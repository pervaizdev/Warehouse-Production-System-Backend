/**
 * auth.middleware.js — JWT Authentication
 * 
 * HOW JWT AUTH WORKS (quick lesson):
 * 
 * 1. User logs in → server creates a JWT token containing user info (empId, name, role)
 * 2. Frontend stores the token and sends it with every request:
 *    Headers: { Authorization: "Bearer eyJhbGciOi..." }
 * 3. This middleware intercepts EVERY protected request and:
 *    a. Extracts the token from the header
 *    b. Verifies it wasn't tampered with (jwt.verify)
 *    c. Decodes the user info and attaches it to req.user
 *    d. If invalid → 401/403 response, request never reaches your controller
 * 
 */

const jwt = require("jsonwebtoken");
const { sendError } = require("../utils/response.helper");

function authenticateToken(req, res, next) {
  // Extract token from "Bearer <token>" header or query parameter
  const authHeader = req.headers["authorization"];
  const token = (authHeader && authHeader.split(" ")[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  if (!process.env.JWT_SECRET) {
    console.error("⚠️ JWT_SECRET is not configured in .env");
    return res.status(500).json({
      success: false,
      message: "Server authentication not configured",
    });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({
          success: false,
          message: "Invalid or expired token",
        });
      }

      // Normalize identity fields 
      decoded.empId = String(decoded.empId || decoded.userId || "unknown");
      decoded.fullName = decoded.fullName || decoded.firstName || decoded.email || "Unknown User";

      req.user = decoded; // Now available in all controllers as req.user
      next();
    });
  } catch (err) {
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

module.exports = authenticateToken;
