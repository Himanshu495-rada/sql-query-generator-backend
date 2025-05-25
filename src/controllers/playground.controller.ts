import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../index';
import { ApiError } from '../middleware/errorHandler';

// Get all playgrounds for the authenticated user
export const getAllPlaygrounds = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const playgrounds = await prisma.playground.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        connections: {
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                type: true,
                host: true,
                database: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { playgrounds },
    });
  } catch (error) {
    next(error);
  }
};

// Get a specific playground by ID
export const getPlaygroundById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const playgroundId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const playground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
      include: {
        connections: {
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                type: true,
                host: true,
                database: true,
                sandboxDb: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!playground) {
      throw new ApiError(404, 'Playground not found');
    }

    res.status(200).json({
      success: true,
      data: { playground },
    });
  } catch (error) {
    next(error);
  }
};

// Create a new playground
export const createPlayground = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { name, description, connections = [] } = req.body;

    if (!name) {
      throw new ApiError(400, 'Playground name is required');
    }

    // Create the playground
    const playgroundId = uuidv4();
    const playground = await prisma.playground.create({
      data: {
        id: playgroundId,
        name,
        description,
        userId,
      },
    });

    // Add connections if provided
    if (connections.length > 0) {
      const connectionsData = connections.map((connectionId: string) => ({
        playgroundId,
        connectionId,
      }));

      await prisma.playgroundConnection.createMany({
        data: connectionsData,
      });
    }

    const createdPlayground = await prisma.playground.findUnique({
      where: { id: playgroundId },
      include: {
        connections: {
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: { playground: createdPlayground },
    });
  } catch (error) {
    next(error);
  }
};

// Update a playground
export const updatePlayground = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const playgroundId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Check if playground exists and belongs to the user
    const existingPlayground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!existingPlayground) {
      throw new ApiError(404, 'Playground not found');
    }

    const { name, description } = req.body;

    // Update the playground
    const updatedPlayground = await prisma.playground.update({
      where: { id: playgroundId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
      include: {
        connections: {
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { playground: updatedPlayground },
    });
  } catch (error) {
    next(error);
  }
};

// Delete a playground
export const deletePlayground = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const playgroundId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Check if playground exists and belongs to the user
    const existingPlayground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!existingPlayground) {
      throw new ApiError(404, 'Playground not found');
    }

    // Delete the playground connections first
    await prisma.playgroundConnection.deleteMany({
      where: { playgroundId },
    });

    // Delete all associated chat messages
    await prisma.chatMessage.deleteMany({
      where: { playgroundId },
    });

    // Delete all associated queries
    await prisma.query.deleteMany({
      where: { playgroundId },
    });

    // Delete the playground
    await prisma.playground.delete({
      where: { id: playgroundId },
    });

    res.status(200).json({
      success: true,
      message: 'Playground deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get all queries for a playground
export const getPlaygroundQueries = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const playgroundId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Check if playground exists and belongs to the user
    const existingPlayground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!existingPlayground) {
      throw new ApiError(404, 'Playground not found');
    }

    // Get all queries for the playground
    const queries = await prisma.query.findMany({
      where: { playgroundId },
      orderBy: { createdAt: 'desc' },
      include: {
        sandboxDb: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { queries },
    });
  } catch (error) {
    next(error);
  }
};

// Add a connection to a playground
export const addConnectionToPlayground = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const playgroundId = req.params.id;
    const { connectionId } = req.body;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    if (!connectionId) {
      throw new ApiError(400, 'Connection ID is required');
    }

    // Check if playground exists and belongs to the user
    const existingPlayground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!existingPlayground) {
      throw new ApiError(404, 'Playground not found');
    }

    // Check if connection exists and belongs to the user
    const existingConnection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        userId,
        isActive: true,
      },
    });

    if (!existingConnection) {
      throw new ApiError(404, 'Connection not found');
    }

    // Check if the connection is already added to the playground
    const existingPlaygroundConnection = await prisma.playgroundConnection.findUnique({
      where: {
        playgroundId_connectionId: {
          playgroundId,
          connectionId,
        },
      },
    });

    if (existingPlaygroundConnection) {
      throw new ApiError(400, 'Connection is already added to this playground');
    }

    // Add the connection to the playground
    await prisma.playgroundConnection.create({
      data: {
        playgroundId,
        connectionId,
      },
    });

    // Get updated playground data
    const playground = await prisma.playground.findUnique({
      where: { id: playgroundId },
      include: {
        connections: {
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                type: true,
                host: true,
                database: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { playground },
    });
  } catch (error) {
    next(error);
  }
};

// Remove a connection from a playground
export const removeConnectionFromPlayground = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const playgroundId = req.params.id;
    const connectionId = req.params.connectionId;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Check if playground exists and belongs to the user
    const existingPlayground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!existingPlayground) {
      throw new ApiError(404, 'Playground not found');
    }

    // Check if the connection is added to the playground
    const existingPlaygroundConnection = await prisma.playgroundConnection.findUnique({
      where: {
        playgroundId_connectionId: {
          playgroundId,
          connectionId,
        },
      },
    });

    if (!existingPlaygroundConnection) {
      throw new ApiError(404, 'Connection not found in this playground');
    }

    // Remove the connection from the playground
    await prisma.playgroundConnection.delete({
      where: {
        playgroundId_connectionId: {
          playgroundId,
          connectionId,
        },
      },
    });

    // Get updated playground data
    const playground = await prisma.playground.findUnique({
      where: { id: playgroundId },
      include: {
        connections: {
          include: {
            connection: {
              select: {
                id: true,
                name: true,
                type: true,
                host: true,
                database: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { playground },
    });
  } catch (error) {
    next(error);
  }
}; 