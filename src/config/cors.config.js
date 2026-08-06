/**
 * cors.config.js — CORS (Cross-Origin Resource Sharing) Configuration
 * 
 * WHAT IS CORS?
 * Browsers block requests from one domain to another by default (security).
 * Your React frontend at localhost:3000 can't call your Express API at localhost:3001
 * unless the API explicitly says "I allow requests from localhost:3000".
 * 
 * WHY a separate config file?
 * In Dome's app.js, CORS config is mixed with 150+ lines of other setup.
 * Here it's isolated — easy to find, easy to modify when deploying.
 */

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",   // Vite default
  // Add your production/staging URLs here:
  // "https://wms.yourdomain.com",
];

module.exports = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin.replace(/\/$/, ""); // Remove trailing slash

    // Allow any localhost port in development
    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);

    if (allowedOrigins.includes(normalizedOrigin) || isLocal) {
      callback(null, true);
    } else {
      console.warn(`🛑 CORS: Blocked origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true, // Allow cookies/auth headers
};
