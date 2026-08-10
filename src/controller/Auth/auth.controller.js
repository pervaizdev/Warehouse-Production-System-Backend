const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { poolPromise } = require("../../database/connection");

/**
 * Generate Access Token
 */
function generateAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  });
}

/**
 * Generate Refresh Token
 */
function generateRefreshToken(payload) {
  // Add a type to differentiate if ever needed
  return jwt.sign({ ...payload, type: "refresh" }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  });
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // STEP 1: Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const pool = await poolPromise;

    // STEP 2: Find the active employee by email (Parameterized)
    const empResult = await pool
      .request()
      .input("email", email)
      .query(`
        SELECT ID, EmpID, OfficeEmail
        FROM HCM_GMS.dbo.MstEmployee
        WHERE OfficeEmail = @email
        AND flgActive = 1
      `);

    // STEP 3: Handle employee not found
    if (empResult.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const employee = empResult.recordset[0];

    // STEP 4: Get PassCode from MstUsers (Parameterized)
    const userResult = await pool
      .request()
      .input("empId", employee.EmpID)
      .query(`
        SELECT PassCode
        FROM HCM_GMS.dbo.MstUsers
        WHERE USERid = @empId
      `);

    if (userResult.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const passCodeFromDb = userResult.recordset[0].PassCode;

    // STEP 5: Compare password
    let isMatch = false;
    
    // Check if the passcode in the DB looks like a bcrypt hash (starts with $2a$ or $2b$)
    if (passCodeFromDb && (passCodeFromDb.startsWith("$2a$") || passCodeFromDb.startsWith("$2b$"))) {
      isMatch = await bcrypt.compare(password, passCodeFromDb);
    } else {
      // Legacy plaintext comparison
      isMatch = (password === passCodeFromDb);
    }

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // SUCCESSFUL LOGIN: Generate tokens
    const jwtPayload = {
      id: employee.ID,
      empId: employee.EmpID,
      email: employee.OfficeEmail,
      role: 'Warehouse Manager'
    };

    const accessToken = generateAccessToken(jwtPayload);
    const refreshToken = generateRefreshToken(jwtPayload);

    // Set refresh token in HTTP-only cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "strict", // Adjust according to your frontend/backend host setup
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    });

    // Return response
    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
      
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * POST /api/auth/refresh
 */
async function refresh(req, res) {
  try {
    const { refreshToken } = req.cookies;

    // 1 & 2: Read token, check if exists
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is missing",
      });
    }

    // 3 & 4: Verify token and check expiration automatically
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Refresh token is invalid or expired",
      });
    }

    // 5 & 6: Verify employee is still active
    const pool = await poolPromise;
    const empResult = await pool
      .request()
      .input("id", decoded.id)
      .query(`
        SELECT ID, EmpID, OfficeEmail
        FROM HCM_GMS.dbo.MstEmployee
        WHERE ID = @id
        AND flgActive = 1
      `);

    if (empResult.recordset.length === 0) {
      // Employee inactive or deleted, clear the cookie
      res.clearCookie("refreshToken", { path: "/api/auth" });
      return res.status(401).json({
        success: false,
        message: "Account is no longer active",
      });
    }

    const employee = empResult.recordset[0];

    // 7. Generate new access and refresh tokens (Rotation)
    const newPayload = {
      id: employee.ID,
      empId: employee.EmpID,
      email: employee.OfficeEmail,
      role: 'Warehouse Manager'
    };

    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    // Replace existing cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/api/auth",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 8. Return the new access token
    return res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * POST /api/auth/logout
 */
function logout(req, res) {
  // Clear the refresh token cookie
  res.clearCookie("refreshToken", { path: "/api/auth" });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
}

/**
 * GET /api/auth/me
 */
function getMe(req, res) {
  // req.user is populated by authenticateToken middleware
  return res.status(200).json({
    success: true,
    data: {
      empId: req.user.empId,
      email: req.user.email,
      role: req.user.role,
      id: req.user.id
    },
  });
}

module.exports = {
  login,
  refresh,
  logout,
  getMe,
};
