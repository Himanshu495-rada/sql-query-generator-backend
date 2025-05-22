import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// Custom error class for API errors
export class ApiError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(statusCode: number, message: string, isOperational = true, stack = '') {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Error handler middleware
export const errorHandler = (
  err: Error | ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let isOperational = false;

  // Handle known errors
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    isOperational = err.isOperational;
  }

  // Log the error
  if (isOperational) {
    logger.warn({
      message: `${message} - ${req.method} ${req.url}`,
      statusCode,
      error: err.message,
    });
  } else {
    logger.error({
      message: `Unhandled error - ${req.method} ${req.url}`,
      error: err.message,
      stack: err.stack,
    });
  }

  // Only send error details in development
  const response = {
    success: false,
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  };

  res.status(statusCode).json(response);
};

// Handle unhandled promise rejections
export const handleUnhandledRejection = (error: Error) => {
  logger.error('UNHANDLED REJECTION! Shutting down...', {
    error: error.message,
    stack: error.stack,
  });
  
  // Give the server a second to finish current requests before shutting down
  setTimeout(() => {
    process.exit(1);
  }, 1000);
};

// Handle uncaught exceptions
export const handleUncaughtException = (error: Error) => {
  logger.error('UNCAUGHT EXCEPTION! Shutting down...', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
}; 