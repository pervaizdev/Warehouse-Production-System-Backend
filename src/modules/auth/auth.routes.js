/**
 * auth.routes.js — Authentication Routes
 * 
 * ROUTE FILE RULES:
 * 1. Routes ONLY define endpoints and wire them to controllers
 * 2. NO business logic here — that belongs in the controller
 * 3. Apply middleware (auth, validation) between route path and controller
 * 
 * PATTERN:
 *   router.post("/login", [optional middleware], controller.login);
 *          ↑ HTTP method    ↑ path              ↑ handler function
 */

const router = require("express").Router();
const authController = require("./auth.controller");

// Public routes (no auth required)
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);

// Protected routes (we can add authenticateToken middleware later)
router.post("/logout", authController.logout);
// router.get("/me", authenticateToken, authController.getProfile);

module.exports = router;
