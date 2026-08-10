

const jwt = require("jsonwebtoken");


function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = (authHeader && authHeader.split(" ")[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access token required",
    });
  }

  if (!process.env.JWT_ACCESS_SECRET) {
    console.error("⚠️ JWT_ACCESS_SECRET is not configured in .env");
    return res.status(500).json({
      success: false,
      message: "Server authentication not configured",
    });
  }

  try {
    jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
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
