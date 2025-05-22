import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../index';
import { ApiError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import * as databaseService from '../services/database.service';
import * as sandboxService from '../services/sandbox.service';
import { DatabaseType } from '@prisma/client';
import { DATABASE_TYPES } from '../utils/types';

// Extend Request type to include file from multer
interface MulterRequest extends Request {
  file?: {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    destination: string;
    filename: string;
    path: string;
    size: number;
  };
}

// Get all connections for the authenticated user
export const getAllConnections = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const connections = await prisma.connection.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        database: true,
        isSample: true,
        createdAt: true,
        updatedAt: true,
        sandboxDb: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { connections },
    });
  } catch (error) {
    next(error);
  }
};

// Get a specific connection by ID
export const getConnectionById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const connectionId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        userId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        username: true,
        database: true,
        connectionString: true,
        options: true,
        isSample: true,
        createdAt: true,
        updatedAt: true,
        sandboxDb: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
      },
    });

    if (!connection) {
      throw new ApiError(404, 'Connection not found');
    }

    res.status(200).json({
      success: true,
      data: { connection },
    });
  } catch (error) {
    next(error);
  }
};

// Create a new database connection
export const createConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const {
      name,
      type,
      host,
      port,
      username,
      password,
      database,
      connectionString,
      options,
      isSample = false,
      createSandbox = true,
    } = req.body;

    // Validate required fields
    if (!name || !type) {
      throw new ApiError(400, 'Name and database type are required');
    }

    // Validate database type
    if (!Object.values(DatabaseType).includes(type)) {
      throw new ApiError(400, 'Invalid database type');
    }

    // Validate required fields based on type
    if (!isSample && !connectionString) {
      // For non-sample connections without a connection string, validate other fields
      if (type !== DatabaseType.SQLITE && (!host || !port)) {
        throw new ApiError(400, 'Host and port are required for non-SQLite databases');
      }

      if (!database) {
        throw new ApiError(400, 'Database name is required');
      }
    }

    // Create the connection
    const connectionId = uuidv4();
    const connection = await prisma.connection.create({
      data: {
        id: connectionId,
        name,
        type,
        host,
        port,
        username,
        password,
        database,
        connectionString,
        options,
        isSample,
        userId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        database: true,
        isSample: true,
        createdAt: true,
      },
    });

    // Test the connection
    try {
      const config = {
        type,
        host,
        port,
        username,
        password,
        database,
        connectionString,
        options,
      };

      await databaseService.connectToDatabase(connectionId, config);
      
      // Get schema for later use
      const schema = await databaseService.getDatabaseSchema(connectionId);
      
      // Create sandbox if requested
      let sandboxDb = null;
      
      if (createSandbox && DATABASE_TYPES.find(dt => dt.type === type)?.supportsSandbox) {
        sandboxDb = await sandboxService.createSandboxDatabase(connectionId, config, schema);
      }

      // Close the connection
      await databaseService.closeDatabaseConnection(connectionId);

      res.status(201).json({
        success: true,
        data: { 
          connection,
          sandboxDb,
        },
      });
    } catch (error: any) {
      // Delete the connection if test fails
      await prisma.connection.delete({
        where: { id: connectionId },
      });

      throw new ApiError(400, `Connection test failed: ${error.message}`);
    }
  } catch (error) {
    next(error);
  }
};

// Update an existing connection
export const updateConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const connectionId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
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

    const {
      name,
      host,
      port,
      username,
      password,
      database,
      connectionString,
      options,
    } = req.body;

    // Update the connection
    const updatedConnection = await prisma.connection.update({
      where: { id: connectionId },
      data: {
        ...(name && { name }),
        ...(host && { host }),
        ...(port && { port }),
        ...(username && { username }),
        ...(password && { password }),
        ...(database && { database }),
        ...(connectionString && { connectionString }),
        ...(options && { options }),
      },
      select: {
        id: true,
        name: true,
        type: true,
        host: true,
        port: true,
        database: true,
        isSample: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      data: { connection: updatedConnection },
    });
  } catch (error) {
    next(error);
  }
};

// Delete a connection
export const deleteConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const connectionId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
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

    // Delete sandbox database if it exists
    const sandboxDb = await prisma.sandboxDb.findUnique({
      where: { connectionId },
    });

    if (sandboxDb) {
      try {
        await sandboxService.deleteSandboxDatabase(sandboxDb.id);
      } catch (error) {
        logger.error(`Error deleting sandbox database: ${error}`);
      }
    }

    // Delete the connection (in reality, just mark as inactive)
    await prisma.connection.update({
      where: { id: connectionId },
      data: {
        isActive: false,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Connection deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Test a connection without saving it
export const testConnection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const {
      type,
      host,
      port,
      username,
      password,
      database,
      connectionString,
      options,
    } = req.body;

    // Validate database type
    if (!Object.values(DatabaseType).includes(type)) {
      throw new ApiError(400, 'Invalid database type');
    }

    // Generate a temporary connection ID
    const tempConnectionId = `temp_${uuidv4()}`;

    try {
      const config = {
        type,
        host,
        port,
        username,
        password,
        database,
        connectionString,
        options,
      };

      // Test the connection
      await databaseService.connectToDatabase(tempConnectionId, config);
      
      // Close the connection
      await databaseService.closeDatabaseConnection(tempConnectionId);

      res.status(200).json({
        success: true,
        message: 'Connection test successful',
      });
    } catch (error: any) {
      throw new ApiError(400, `Connection test failed: ${error.message}`);
    }
  } catch (error) {
    next(error);
  }
};

// Get database schema for a connection
export const getDatabaseSchema = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const connectionId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
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
      throw new ApiError(404, 'Connection not found');
    }

    // Check if we have a cached schema in the sandbox
    const sandboxDb = await prisma.sandboxDb.findUnique({
      where: { connectionId },
      select: { schema: true },
    });

    if (sandboxDb?.schema) {
      return res.status(200).json({
        success: true,
        data: { schema: sandboxDb.schema },
        source: 'cache',
      });
    }

    // Connect to the database to get schema
    const config = {
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database,
      connectionString: connection.connectionString,
      options: connection.options as any,
    };

    try {
      // Connect to the database
      await databaseService.connectToDatabase(connectionId, config);
      
      // Get the schema
      const schema = await databaseService.getDatabaseSchema(connectionId);
      
      // Close the connection
      await databaseService.closeDatabaseConnection(connectionId);

      // If we have a sandbox, update its cached schema
      if (sandboxDb) {
        await prisma.sandboxDb.update({
          where: { connectionId },
          data: { schema },
        });
      }

      res.status(200).json({
        success: true,
        data: { schema },
        source: 'live',
      });
    } catch (error: any) {
      throw new ApiError(500, `Failed to get database schema: ${error.message}`);
    }
  } catch (error) {
    next(error);
  }
};

// Get sample databases
export const getSampleDatabases = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Get sample databases from environment or config
    const sampleDatabases = [
      {
        name: 'Sample PostgreSQL Database',
        type: DatabaseType.POSTGRESQL,
        description: 'A sample database with employees, departments, and projects.',
        host: process.env.SAMPLE_DB_HOST || 'localhost',
        port: parseInt(process.env.SAMPLE_DB_PORT || '5432'),
        username: process.env.SAMPLE_DB_USER || 'sample_user',
        password: process.env.SAMPLE_DB_PASSWORD || 'sample_password',
        database: process.env.SAMPLE_DB_NAME || 'sample_db',
        isSample: true,
      },
      // Add more sample databases as needed
    ];

    res.status(200).json({
      success: true,
      data: { sampleDatabases },
    });
  } catch (error) {
    next(error);
  }
};

// Add SQLite file upload controller
export const uploadSqliteFile = async (
  req: MulterRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Get form data
    const { name, createSandbox } = req.body;
    const file = req.file;

    if (!file) {
      throw new ApiError(400, 'No file uploaded');
    }

    if (!name) {
      throw new ApiError(400, 'Connection name is required');
    }

    // Create the connection
    const connectionId = uuidv4();
    const connection = await prisma.connection.create({
      data: {
        id: connectionId,
        name,
        type: DatabaseType.SQLITE,
        connectionString: file.path,
        isSample: false,
        userId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        connectionString: true,
        isSample: true,
        createdAt: true,
      },
    });

    // Test the connection
    try {
      const config = {
        type: DatabaseType.SQLITE,
        connectionString: file.path,
      };

      await databaseService.connectToDatabase(connectionId, config);
      
      // Get schema for later use
      const schema = await databaseService.getDatabaseSchema(connectionId);
      
      // Create sandbox if requested
      let sandboxDb = null;
      
      if (createSandbox === 'true' && DATABASE_TYPES.find(dt => dt.type === DatabaseType.SQLITE)?.supportsSandbox) {
        sandboxDb = await sandboxService.createSandboxDatabase(connectionId, config, schema);
      }

      // Close the connection
      await databaseService.closeDatabaseConnection(connectionId);

      res.status(201).json({
        success: true,
        data: { 
          connection,
          sandboxDb,
        },
      });
    } catch (error: any) {
      // Delete the connection if test fails
      await prisma.connection.delete({
        where: { id: connectionId },
      });

      throw new ApiError(400, `Connection test failed: ${error.message}`);
    }
  } catch (error) {
    next(error);
  }
}; 