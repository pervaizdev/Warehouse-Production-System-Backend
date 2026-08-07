

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",  
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
