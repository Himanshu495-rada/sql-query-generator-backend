import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { prisma } from '../index';
import { ApiError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import * as databaseService from '../services/database.service';
import { AIGeneratedQuery } from '../utils/types';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generate SQL from natural language prompt
export const generateQuery = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { prompt, playgroundId, connectionId } = req.body;

    if (!prompt) {
      throw new ApiError(400, 'Prompt is required');
    }

    if (!playgroundId) {
      throw new ApiError(400, 'Playground ID is required');
    }

    if (!connectionId) {
      throw new ApiError(400, 'Connection ID is required');
    }

    // Check if playground exists and belongs to the user
    const playground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!playground) {
      throw new ApiError(404, 'Playground not found');
    }

    // Check if connection exists and belongs to the user
    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        userId,
        isActive: true,
      },
      include: {
        sandboxDb: true,
      },
    });

    if (!connection) {
      throw new ApiError(404, 'Connection not found');
    }

    // Get database schema for context
    let schema = null;

    if (connection.sandboxDb?.schema) {
      schema = connection.sandboxDb.schema;
    } else {
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
        await databaseService.connectToDatabase(connectionId, config);
        schema = await databaseService.getDatabaseSchema(connectionId);
        await databaseService.closeDatabaseConnection(connectionId);
      } catch (error) {
        logger.error(`Error getting database schema: ${error}`);
        throw new ApiError(500, 'Failed to get database schema');
      }
    }

    // Get previous queries from this playground for context
    const previousQueries = await prisma.query.findMany({
      where: { playgroundId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        prompt: true,
        sqlQuery: true,
      },
    });

    // Call OpenAI API to generate SQL
    const generatedQuery = await generateSqlWithOpenAI(prompt, schema, previousQueries, connection.type);

    // Save the query to the database
    const queryId = uuidv4();
    const query = await prisma.query.create({
      data: {
        id: queryId,
        playgroundId,
        sandboxDbId: connection.sandboxDb?.id,
        prompt,
        sqlQuery: generatedQuery.query,
        explanation: generatedQuery.explanation,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        query: {
          ...query,
          result: null,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// Execute SQL query on a database
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

    const { queryId, sqlQuery } = req.body;

    if (!queryId) {
      throw new ApiError(400, 'Query ID is required');
    }

    if (!sqlQuery) {
      throw new ApiError(400, 'SQL query is required');
    }

    // Get the query from the database
    const query = await prisma.query.findUnique({
      where: { id: queryId },
      include: {
        playground: true,
        sandboxDb: {
          include: {
            connection: true,
          },
        },
      },
    });

    if (!query) {
      throw new ApiError(404, 'Query not found');
    }

    // Check if playground belongs to the user
    if (query.playground.userId !== userId) {
      throw new ApiError(403, 'Not authorized to execute this query');
    }

    // Check if sandbox database exists
    if (!query.sandboxDb) {
      throw new ApiError(400, 'No sandbox database associated with this query');
    }

    // Execute the query on the sandbox database
    const sandboxConfig = {
      type: query.sandboxDb.connection.type,
      host: query.sandboxDb.host || query.sandboxDb.connection.host,
      port: query.sandboxDb.port || query.sandboxDb.connection.port,
      username: query.sandboxDb.username || query.sandboxDb.connection.username,
      password: query.sandboxDb.password || query.sandboxDb.connection.password,
      database: query.sandboxDb.name,
      connectionString: query.sandboxDb.connectionString,
    };

    const sandboxConnId = `sandbox_conn_${Date.now()}`;

    try {
      await databaseService.connectToDatabase(sandboxConnId, sandboxConfig);
      const result = await databaseService.executeQuery(sandboxConnId, sqlQuery);

      // Update the query with the result
      const updatedQuery = await prisma.query.update({
        where: { id: queryId },
        data: {
          sqlQuery, // Update with potentially modified query
          result: result as any,
          executionTime: result.executionTime,
        },
      });

      await databaseService.closeDatabaseConnection(sandboxConnId);

      res.status(200).json({
        success: true,
        data: { 
          query: updatedQuery,
        },
      });
    } catch (error: any) {
      // Update the query with the error
      await prisma.query.update({
        where: { id: queryId },
        data: {
          sqlQuery, // Update with potentially modified query
          error: error.message,
        },
      });

      // Make sure to close the connection
      await databaseService.closeDatabaseConnection(sandboxConnId);

      throw new ApiError(400, `Query execution failed: ${error.message}`);
    }
  } catch (error) {
    next(error);
  }
};

// Save a query
export const saveQuery = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    const { prompt, sqlQuery, playgroundId, sandboxDbId, explanation } = req.body;

    if (!prompt || !sqlQuery || !playgroundId) {
      throw new ApiError(400, 'Prompt, SQL query, and playground ID are required');
    }

    // Check if playground exists and belongs to the user
    const playground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!playground) {
      throw new ApiError(404, 'Playground not found');
    }

    // Check if sandbox database exists if provided
    if (sandboxDbId) {
      const sandboxDb = await prisma.sandboxDb.findUnique({
        where: { id: sandboxDbId },
        include: {
          connection: true,
        },
      });

      if (!sandboxDb || sandboxDb.connection.userId !== userId) {
        throw new ApiError(404, 'Sandbox database not found');
      }
    }

    // Save the query
    const queryId = uuidv4();
    const query = await prisma.query.create({
      data: {
        id: queryId,
        playgroundId,
        sandboxDbId,
        prompt,
        sqlQuery,
        explanation,
      },
    });

    res.status(201).json({
      success: true,
      data: { query },
    });
  } catch (error) {
    next(error);
  }
};

// Get query by ID
export const getQueryById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const queryId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Get the query from the database
    const query = await prisma.query.findUnique({
      where: { id: queryId },
      include: {
        playground: true,
        sandboxDb: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!query) {
      throw new ApiError(404, 'Query not found');
    }

    // Check if playground belongs to the user
    if (query.playground.userId !== userId) {
      throw new ApiError(403, 'Not authorized to view this query');
    }

    res.status(200).json({
      success: true,
      data: { query },
    });
  } catch (error) {
    next(error);
  }
};

// Delete a query
export const deleteQuery = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const queryId = req.params.id;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Get the query from the database to check ownership
    const query = await prisma.query.findUnique({
      where: { id: queryId },
      include: {
        playground: true,
      },
    });

    if (!query) {
      throw new ApiError(404, 'Query not found');
    }

    // Check if playground belongs to the user
    if (query.playground.userId !== userId) {
      throw new ApiError(403, 'Not authorized to delete this query');
    }

    // Delete the query
    await prisma.query.delete({
      where: { id: queryId },
    });

    res.status(200).json({
      success: true,
      message: 'Query deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// Get query history for a playground
export const getQueryHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const playgroundId = req.params.playgroundId;
    
    if (!userId) {
      throw new ApiError(401, 'Authentication required');
    }

    // Check if playground exists and belongs to the user
    const playground = await prisma.playground.findFirst({
      where: {
        id: playgroundId,
        userId,
      },
    });

    if (!playground) {
      throw new ApiError(404, 'Playground not found');
    }

    // Get query history
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

/**
 * Generate SQL query using OpenAI API
 */
const generateSqlWithOpenAI = async (
  prompt: string,
  schema: any,
  previousQueries: { prompt: string; sqlQuery: string }[],
  databaseType: string
): Promise<AIGeneratedQuery> => {
  try {
    // Format schema information
    const schemaInfo = formatSchemaForPrompt(schema);
    
    // Format previous queries
    const previousQueriesInfo = previousQueries.length > 0
      ? `Previous queries in this playground:\n${previousQueries.map(q => `User: ${q.prompt}\nSQL: ${q.sqlQuery}`).join('\n\n')}`
      : 'No previous queries in this playground.';

    // Construct messages for OpenAI
    const messages = [
      {
        role: 'system',
        content: `You are a SQL expert that converts natural language queries to SQL. 
        You support various database types including PostgreSQL, MySQL, SQLite, and MongoDB.
        The current database type is: ${databaseType}.
        
        When generating SQL:
        - Make the query as efficient as possible
        - Add appropriate comments to explain complex parts
        - Format the query with proper indentation
        - For MongoDB, return a valid JSON query string
        
        You should also provide an explanation of the query separate from the SQL itself.
        
        Respond in JSON format with "query" and "explanation" fields:
        {
          "query": "-- The SQL query here\\nSELECT * FROM users;",
          "explanation": "This query retrieves all users from the database."
        }
        
        This will be parsed as JSON so ensure your response is properly formatted.`
      },
      {
        role: 'user',
        content: `Database Schema:\n${schemaInfo}\n\n${previousQueriesInfo}\n\nUser Query: ${prompt}`
      }
    ];

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',  // or 'gpt-4' for more complex queries
      messages: messages as any,
      temperature: 0.2,        // Lower temperature for more deterministic output
      max_tokens: 1000,
    });

    // Extract JSON response
    const responseText = completion.choices[0].message.content || '';
    
    try {
      // Try to parse as JSON
      const jsonResponse = JSON.parse(responseText);
      return {
        query: jsonResponse.query,
        explanation: jsonResponse.explanation,
      };
    } catch (error) {
      // If parsing fails, try to extract SQL more naively
      const queryMatch = responseText.match(/```sql\n([\s\S]*?)```/);
      const query = queryMatch ? queryMatch[1].trim() : responseText.trim();
      
      return {
        query,
        explanation: 'Generated SQL based on your prompt.',
      };
    }
  } catch (error: any) {
    logger.error(`Error generating SQL with OpenAI: ${error.message}`);
    throw new ApiError(500, `Failed to generate SQL: ${error.message}`);
  }
};

/**
 * Format database schema for OpenAI prompt
 */
const formatSchemaForPrompt = (schema: any): string => {
  if (!schema || !schema.tables || schema.tables.length === 0) {
    return 'No schema information available.';
  }

  let formattedSchema = '';

  // Format each table
  schema.tables.forEach((table: any) => {
    formattedSchema += `Table: ${table.name}\n`;
    
    // Add columns
    formattedSchema += 'Columns:\n';
    table.columns.forEach((column: any) => {
      const primaryKey = column.isPrimaryKey ? ' (PRIMARY KEY)' : '';
      const foreignKey = column.isForeignKey ? ' (FOREIGN KEY)' : '';
      const nullable = column.nullable ? '' : ' NOT NULL';
      formattedSchema += `- ${column.name}: ${column.type}${primaryKey}${foreignKey}${nullable}\n`;
    });
    
    formattedSchema += '\n';
  });

  return formattedSchema;
}; 