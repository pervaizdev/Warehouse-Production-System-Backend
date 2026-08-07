# WMS-Backend

> Warehouse Management System — Backend API 

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env    # Then edit .env with your DB credentials

# Start development server
npm run dev
```

## Project Structure

```
src/
├── app.js                     # Express app setup
├── server.js                  # Entry point
├── config/                    # All configuration
│   ├── app.config.js          # Port, JWT, limits
│   ├── cors.config.js         # Allowed origins
│   └── db.config.js           # Database connections
├── database/
│   └── connection.js          # Multi-DB pool manager
├── middleware/
│   ├── auth.middleware.js     # JWT verification
│   ├── error.middleware.js    # Global error handler
│   └── validate.middleware.js # Request validation
├── modules/                   # Feature modules (route + controller + model)
│   └── auth/
│       ├── auth.routes.js
│       └── auth.controller.js
├── routes/
│   └── index.js               # Central route loader
└── utils/
    ├── logger.js              # Logging utility
    ├── query.helper.js        # Pagination, search, sort
    └── response.helper.js     # Standard API responses
```

## Adding a New Module

1. Create folder: `src/modules/your-module/`
2. Add files: `your-module.routes.js`, `your-module.controller.js`, `your-module.model.js`
3. Register in `src/routes/index.js`:
   ```js
   const yourModuleRoutes = require("../modules/your-module/your-module.routes");
   app.use("/api/your-module", authenticateToken, yourModuleRoutes);
   ```

## API Response Format

All APIs follow a consistent format:

```json
{
  "success": true,
  "message": "Success",
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 150, "pages": 8 }
}
```
