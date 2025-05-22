import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';
import { ApiError } from './errorHandler';

// Extend the Express Request interface to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

// Authentication middleware
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Get the token from the Authorization header
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;

    if (!token) {
      throw new ApiError(401, 'Authentication required');
    }

    // Verify the token
    const jwtSecret = process.env.JWT_SECRET || 'default_secret_for_dev';
    const decoded = jwt.verify(token, jwtSecret) as {
      id: string;
      email: string;
      iat: number;
      exp: number;
    };

    // Check if the user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new ApiError(401, 'User no longer exists');
    }

    // Attach the user to the request object
    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new ApiError(401, 'Invalid or expired token'));
    } else {
      next(error);
    }
  }
};

// Admin-only middleware (for future use)
export const authorizeAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // TODO: Implement admin authorization when needed
  next(new ApiError(403, 'Admin access required'));
}; 