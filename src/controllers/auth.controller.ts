import { Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../index";
import { ApiError } from "../middleware/errorHandler";
import { logger } from "../utils/logger";
import { string } from "zod/v4";

// Register a new user
export const register = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password, name } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ApiError(409, "User with this email already exists");
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = await prisma.user.create({
      data: {
        id: uuidv4(),
        email,
        password: hashedPassword,
        name,
        settings: {
          create: {
            id: uuidv4(),
            theme: "light",
            codeEditorTheme: "vs-dark",
            notificationsEnabled: true,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    res.status(201).json({
      success: true,
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Login user
export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
      },
    });

    if (!user) {
      throw new ApiError(401, "Invalid credentials");
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new ApiError(401, "Invalid credentials");
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    res.status(200).json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get current user profile
export const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        settings: {
          select: {
            theme: true,
            codeEditorTheme: true,
            notificationsEnabled: true,
          },
        },
      },
    });

    if (!user) {
      throw new ApiError(404, "User not found");
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

// Refresh token
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new ApiError(400, "Refresh token is required");
    }

    // Verify the token
    const jwtSecret = process.env.JWT_SECRET || "default_secret_for_dev";

    try {
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
        throw new ApiError(401, "User no longer exists");
      }

      // Generate a new token
      const newToken = generateToken(user.id, user.email);

      res.status(200).json({
        success: true,
        data: { token: newToken },
      });
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new ApiError(401, "Invalid or expired token");
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

// Logout user
export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // In a stateless JWT implementation, we don't need to do anything server-side
    // Actual logout happens client-side by removing the token

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Forgot password
export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal whether a user exists for security reasons
      return res.status(200).json({
        success: true,
        message:
          "If a user with that email exists, a password reset link has been sent",
      });
    }

    // In a real implementation, generate a reset token and send email
    // For now, just log it
    logger.info(`Password reset requested for ${email}`);

    res.status(200).json({
      success: true,
      message:
        "If a user with that email exists, a password reset link has been sent",
    });
  } catch (error) {
    next(error);
  }
};

// Reset password
export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token, password } = req.body;

    // In a real implementation, verify the reset token and update password
    // For now, just log it
    logger.info(`Password reset with token: ${token}`);

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to generate JWT token
const generateToken = (id: string, email: string): string => {
  const jwtSecret = process.env.JWT_SECRET || "default_secret_for_dev";
  const expiresIn = 8 * 60 * 60; // Default to 8 hours

  return jwt.sign({ id, email }, jwtSecret, {
    expiresIn: expiresIn,
    algorithm: "HS256",
  });
};
