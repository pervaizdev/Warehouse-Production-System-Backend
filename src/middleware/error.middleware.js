function errorHandler(err, req, res, next) {
  console.error(err.message || "Unhandled Exception", err);

  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message,
    stack: err.stack,
  });
}

module.exports = errorHandler;
