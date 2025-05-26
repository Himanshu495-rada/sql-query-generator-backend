import { Request, Response, NextFunction } from "express";
import { prisma } from "../index";
import { ApiError } from "../middleware/errorHandler";
import * as sandboxService from "../services/sandbox.service";
import * as databaseService from "../services/database.service";

// Get sandbox status for a connection
export const getSandboxStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const connectionId = req.params.connectionId;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
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
      throw new ApiError(404, "Connection not found");
    }

    // Get sandbox status
    const status = await sandboxService.getSandboxStatus(connectionId);

    res.status(200).json({
      success: true,
      data: {
        status,
        hasSandbox: status !== null,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Create a sandbox for a connection
export const createSandbox = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const connectionId = req.params.connectionId;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
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
      throw new ApiError(404, "Connection not found");
    }

    // Check if sandbox already exists
    const existingSandbox = await prisma.sandboxDb.findUnique({
      where: { connectionId },
    });

    if (existingSandbox) {
      return res.status(200).json({
        success: true,
        data: { sandboxDb: existingSandbox },
        message: "Sandbox already exists for this connection",
      });
    }

    // Get connection config
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

    // Connect to get schema
    await databaseService.connectToDatabase(connectionId, config);
    const schema = await databaseService.getDatabaseSchema(connectionId);
    await databaseService.closeDatabaseConnection(connectionId);

    // Create sandbox
    const sandboxDb = await sandboxService.createSandboxDatabase(
      connectionId,
      config,
      schema
    );

    res.status(201).json({
      success: true,
      data: { sandboxDb },
    });
  } catch (error) {
    next(error);
  }
};

// Reset a sandbox
export const resetSandbox = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const sandboxId = req.params.sandboxId;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    // Check if sandbox exists and belongs to the user
    const sandbox = await prisma.sandboxDb.findUnique({
      where: { id: sandboxId },
      include: {
        connection: true,
      },
    });

    if (!sandbox || sandbox.connection.userId !== userId) {
      throw new ApiError(404, "Sandbox not found");
    }

    // Delete the existing sandbox
    await sandboxService.deleteSandboxDatabase(sandboxId);

    // Get connection config
    const connection = sandbox.connection;
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

    // Connect to get schema
    const connectionId = connection.id;
    await databaseService.connectToDatabase(connectionId, config);
    const schema = await databaseService.getDatabaseSchema(connectionId);
    await databaseService.closeDatabaseConnection(connectionId);

    // Create new sandbox
    const newSandboxDb = await sandboxService.createSandboxDatabase(
      connectionId,
      config,
      schema
    );

    res.status(200).json({
      success: true,
      data: { sandboxDb: newSandboxDb },
    });
  } catch (error) {
    next(error);
  }
};

// Synchronize sandbox schema with original database
export const syncSandboxSchema = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const sandboxId = req.params.sandboxId;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    // Check if sandbox exists and belongs to the user
    const sandbox = await prisma.sandboxDb.findUnique({
      where: { id: sandboxId },
      include: {
        connection: true,
      },
    });

    if (!sandbox || sandbox.connection.userId !== userId) {
      throw new ApiError(404, "Sandbox not found");
    }

    // Get connection config
    const connection = sandbox.connection;
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

    // Connect to get schema
    const connectionId = connection.id;
    await databaseService.connectToDatabase(connectionId, config);
    const schema = await databaseService.getDatabaseSchema(connectionId);
    await databaseService.closeDatabaseConnection(connectionId);

    // Update sandbox schema
    await prisma.sandboxDb.update({
      where: { id: sandboxId },
      data: { schema: schema as any },
    });

    // TODO: In a full implementation, we would also update the sandbox database structure
    // to match the original database structure, but this is complex and depends on the database type

    res.status(200).json({
      success: true,
      message: "Sandbox schema updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

// Delete a sandbox
export const deleteSandbox = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const sandboxId = req.params.sandboxId;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    // Check if sandbox exists and belongs to the user
    const sandbox = await prisma.sandboxDb.findUnique({
      where: { id: sandboxId },
      include: {
        connection: true,
      },
    });

    if (!sandbox || sandbox.connection.userId !== userId) {
      throw new ApiError(404, "Sandbox not found");
    }

    // Delete the sandbox database
    await sandboxService.deleteSandboxDatabase(sandboxId);

    // Delete the sandbox record
    await prisma.sandboxDb.delete({
      where: { id: sandboxId },
    });

    res.status(200).json({
      success: true,
      message: "Sandbox deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
// Note: The above code assumes that the sandboxService and databaseService
