/**
 * validate.middleware.js — Request Validation Helper
 * 
 * WHY validate in middleware instead of controllers?
 * - Controllers should focus on business logic, not checking "is email valid?"
 * - Consistent error format: every validation error looks the same
 * - Reusable: write validation rules once, use on multiple routes
 * 
 * USAGE:
 *   const { validate, rules } = require("../../middleware/validate.middleware");
 *   
 *   router.post("/items",
 *     validate([
 *       rules.required("name"),
 *       rules.required("quantity"),
 *       rules.isNumber("quantity"),
 *     ]),
 *     controller.createItem
 *   );
 * 
 * If validation fails, the request never reaches your controller.
 * Client gets: { success: false, message: "Validation failed", errors: [...] }
 */

// Common validation rules
const rules = {
  /**
   * Check if a field exists and is not empty
   */
  required: (field) => (req) => {
    const value = req.body[field];
    if (value === undefined || value === null || String(value).trim() === "") {
      return `${field} is required`;
    }
    return null;
  },

  /**
   * Check if a field is a valid number
   */
  isNumber: (field) => (req) => {
    const value = req.body[field];
    if (value !== undefined && value !== null && isNaN(Number(value))) {
      return `${field} must be a number`;
    }
    return null;
  },

  /**
   * Check if a field is a valid email
   */
  isEmail: (field) => (req) => {
    const value = req.body[field];
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return `${field} must be a valid email`;
    }
    return null;
  },

  /**
   * Check string max length
   */
  maxLength: (field, max) => (req) => {
    const value = req.body[field];
    if (value && String(value).length > max) {
      return `${field} must be ${max} characters or less`;
    }
    return null;
  },
};

/**
 * Middleware factory: runs all validation rules and returns errors if any fail
 * @param {Function[]} validations - Array of rule functions
 */
function validate(validations) {
  return (req, res, next) => {
    const errors = validations
      .map((rule) => rule(req))
      .filter((error) => error !== null);

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors,
      });
    }

    next();
  };
}

module.exports = { validate, rules };
