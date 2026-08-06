/**
 * auth.controller.js — Authentication Controller
 * 
 * CONTROLLER RULES:
 * 1. Receive the request, call the model/DB, return the response
 * 2. Use response helpers for consistent formatting
 * 3. ALWAYS wrap DB calls in try/catch — never let an unhandled error crash the server
 * 4. Use parameterized queries (@param) — NEVER concatenate user input into SQL
 * 
 * PATTERN (you'll follow this for every controller):
 * 
 *   async methodName(req, res) {
 *     try {
 *       // 1. Extract & validate input
 *       // 2. Query the database
 *       // 3. Return standardized response
 *     } catch (error) {
 *       // 4. Handle errors gracefully
 *     }
 *   }
 */

const jwt = require("jsonwebtoken");
const AuthModel = require("./auth.model");
const { sendSuccess, sendError } = require("../../utils/response.helper");
const { JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_SECRET, REFRESH_TOKEN_EXPIRES_IN } = require("../../config/app.config");

class AuthController {

  /**
   * POST /api/auth/login
   * 
   * Authenticates a user and returns an Access Token and a Refresh Token.
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return sendError(res, "Email and password are required", 400);
      }

      if (!JWT_SECRET || !REFRESH_TOKEN_SECRET) {
        return sendError(res, "Server authentication not configured", 500);
      }

      // ── Database lookup using Model ────────────────────────
      const user = await AuthModel.findUserByEmail(email);

      if (!user || password.trim() !== user.Password.trim()) {
        return sendError(res, "Invalid credentials", 401);
      }

      // ── Generate Tokens ────────────────────────────────────
      const payload = {
        empId: user.empId,
        fullName: user.fullName,
        email: user.email,
        sourceDB: user.SourceDB
      };

      const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      const refreshToken = jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });

      delete user.Password; // NEVER send passwords back

      return sendSuccess(res, { accessToken, refreshToken, user }, "Login successful");

    } catch (error) {
      console.error("Login error:", error);
      return sendError(res, "Authentication failed");
    }
  }

  /**
   * POST /api/auth/refresh
   * 
   * Accepts a Refresh Token and returns a new Access Token.
   */
  static async refresh(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return sendError(res, "Refresh token is required", 400);
      }

      // Verify the refresh token
      jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return sendError(res, "Invalid or expired refresh token", 403);
        }

        // Generate a new Access Token
        const payload = {
          empId: decoded.empId,
          fullName: decoded.fullName,
          email: decoded.email,
          sourceDB: decoded.sourceDB
        };

        const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

        return sendSuccess(res, { accessToken }, "Token refreshed successfully");
      });
    } catch (error) {
      console.error("Refresh error:", error);
      return sendError(res, "Failed to refresh token");
    }
  }
}

module.exports = AuthController;
