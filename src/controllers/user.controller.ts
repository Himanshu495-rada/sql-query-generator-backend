import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../index';
import { ApiError } from '../middleware/errorHandler';

// Get user profile
export const getProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

// Update user profile
export const updateProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { name, email } = req.body;

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw new ApiError(409, 'Email is already in use');
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name && { name }),
        ...(email && { email }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      data: { user: updatedUser },
    });
  } catch (error) {
    next(error);
  }
};

// Get user settings
export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    res.status(200).json({ success: true, data: { settings } });
  } catch (error) {
    next(error);
  }
};

// Update user settings (add sandboxTtlMinutes)
export const updateSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { theme, codeEditorTheme, notificationsEnabled, sandboxTtlMinutes } = req.body;

    // Check if user has settings
    const existingSettings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    let updatedSettings;

    if (existingSettings) {
      // Update existing settings
      updatedSettings = await prisma.userSettings.update({
        where: { userId },
        data: {
          ...(theme !== undefined && { theme }),
          ...(codeEditorTheme !== undefined && { codeEditorTheme }),
          ...(notificationsEnabled !== undefined && { notificationsEnabled }),
          ...(sandboxTtlMinutes !== undefined && { sandboxTtlMinutes }),
        },
      });
    } else {
      // Create new settings
      updatedSettings = await prisma.userSettings.create({
        data: {
          id: uuidv4(),
          userId,
          ...(theme !== undefined && { theme }),
          ...(codeEditorTheme !== undefined && { codeEditorTheme }),
          ...(notificationsEnabled !== undefined && { notificationsEnabled }),
          ...(sandboxTtlMinutes !== undefined && { sandboxTtlMinutes }),
        },
      });
    }

    res.status(200).json({
      success: true,
      data: { settings: updatedSettings },
    });
  } catch (error) {
    next(error);
  }
};

// Change password
export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Current password and new password are required');
    }

    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
      },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get user API keys
export const getApiKeys = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        service: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.status(200).json({
      success: true,
      data: { apiKeys },
    });
  } catch (error) {
    next(error);
  }
};

// Create a new API key
export const createApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { service, key } = req.body;

    if (!service || !key) {
      throw new ApiError(400, 'Service and key are required');
    }

    // Check if key already exists for this service and user
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        userId,
        service,
      },
    });

    let apiKey;

    if (existingKey) {
      // Update existing key
      apiKey = await prisma.apiKey.update({
        where: { id: existingKey.id },
        data: {
          key,
          isActive: true,
        },
        select: {
          id: true,
          service: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } else {
      // Create new key
      apiKey = await prisma.apiKey.create({
        data: {
          id: uuidv4(),
          userId,
          service,
          key,
          isActive: true,
        },
        select: {
          id: true,
          service: true,
          isActive: true,
          createdAt: true,
        },
      });
    }

    res.status(201).json({
      success: true,
      data: { apiKey },
    });
  } catch (error) {
    next(error);
  }
};

// Delete an API key
export const deleteApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const keyId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Check if key exists and belongs to user
    const existingKey = await prisma.apiKey.findFirst({
      where: {
        id: keyId,
        userId,
      },
    });

    if (!existingKey) {
      throw new ApiError(404, 'API key not found');
    }

    // Delete the key
    await prisma.apiKey.delete({
      where: { id: keyId },
    });

    res.status(200).json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}; 