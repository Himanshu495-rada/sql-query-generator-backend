import { Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import { ApiError } from '../middleware/errorHandler';
import * as databaseService from '../services/database.service';

// Execute SQL query directly on a database
export const executeQuery = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { connectionId, sqlQuery } = req.body;

    if (!connectionId) {
      throw new ApiError(400, 'Connection ID is required');
    }

    if (!sqlQuery) {
      throw new ApiError(400, 'SQL query is required');
    }

    // Check if connection exists and belongs to the user
    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        userId,
        isActive: true,
      },
    });

    if (!connection) {
      throw new ApiError(404, 'Connection not found or access denied');
    }

    // Connect to the database
    const config = {
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database,
      connectionString: connection.connectionString,
      options: connection.options,
    };

    await databaseService.connectToDatabase(connectionId, config);

    try {
      // Execute the query
      const result = await databaseService.executeQuery(connectionId, sqlQuery);

      res.status(200).json({
        success: true,
        data: { result },
      });
    } finally {
      // Always close the connection after query execution
      await databaseService.closeDatabaseConnection(connectionId);
    }
  } catch (error) {
    next(error);
  }
}; 