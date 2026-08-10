const express = require("express");
const dotenv = require("dotenv");
dotenv.config();

const errorHandler = require("./middleware/error.middleware");
const applySecurityAndMiddlewares = require("./security/security.setup");
const authRoutes = require("./routes/Auth/auth.route");
const app = express();

applySecurityAndMiddlewares(app);

// ── Custom Request Logger ────────────────────────────────
app.use((req, res, next) => {
  console.log(`\n--- 📥 NEW REQUEST: [${req.method}] ${req.url} ---`);
  if (Object.keys(req.params).length > 0) console.log("Params:", req.params);
  if (Object.keys(req.query).length > 0) console.log("Query:", req.query);
  if (Object.keys(req.body).length > 0) {
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = "***HIDDEN***";
    console.log("Body:", safeBody);
  }
  console.log("------------------------------------------");
  next();
});
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "WMS API is running",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 WMS Server running on: http://localhost:${PORT}`);
  setInterval(() => {}, 1000 * 60 * 60);
});
