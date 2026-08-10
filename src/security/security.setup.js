const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const applySecurityAndMiddlewares = (app) => {
  app.set("trust proxy", 1);
  
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: "Too many requests from this IP, please try again later."
  });
  app.use(limiter);
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  }));

  app.use(hpp());
  app.use(cookieParser());
  app.use(cors({
    origin: true,
    credentials: true,
  }));
  app.use(morgan("dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
};

module.exports = applySecurityAndMiddlewares;
