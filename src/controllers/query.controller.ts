import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import azureOpenAIClient from '../utils/azureOpenai';
import { prisma } from '../index';
import { ApiError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import * as databaseService from '../services/database.service';
import { AIGeneratedQuery } from '../utils/types';
import { executeHybridQuery } from '../services/hybridQuery.service';

// Initialize OpenAI client
// Use either regular OpenAI or Azure OpenAI based on environment configuration
const openai = process.env.USE_AZURE_OPENAI === 'true' 
  ? azureOpenAIClient
  : new OpenAI({
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

    // playgroundId is now optional, enforceDQL can be added for chat context
    const { prompt, playgroundId, connectionId, enforceDQL } = req.body;

    if (!prompt) {
      throw new ApiError(400, 'Prompt is required');
    }

    // connectionId is always required
    if (!connectionId) {
      throw new ApiError(400, 'Connection ID is required');
    }

    let playground = null;
    if (playgroundId) {
      // Check if playground exists and belongs to the user (existing logic)
      playground = await prisma.playground.findFirst({
        where: {
          id: playgroundId,
          userId,
        },
      });

      if (!playground) {
        throw new ApiError(404, 'Playground not found or access denied');
      }
    } 
    // If playgroundId is not provided, we assume it's from the chat context
    // and don't need to validate the playground itself.

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
      throw new ApiError(404, 'Connection not found or access denied');
    }

    // Get database schema for context (existing logic)
    let schema = null;
    if (connection.sandboxDb?.schema) {
      schema = connection.sandboxDb.schema;
    } else {
      const config = {
        type: connection.type,
        host: typeof connection.host === 'string' ? connection.host : undefined,
        port: typeof connection.port === 'number' ? connection.port : undefined,
        username: typeof connection.username === 'string' ? connection.username : undefined,
        password: typeof connection.password === 'string' ? connection.password : undefined,
        database: typeof connection.database === 'string' ? connection.database : undefined,
        connectionString: typeof connection.connectionString === 'string' ? connection.connectionString : undefined,
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

    let previousQueries: { prompt: string; sqlQuery: string }[] = [];

    if (playgroundId) {
      // Get previous queries from this playground for context
      previousQueries = await prisma.query.findMany({
        where: { playgroundId },
        orderBy: { createdAt: 'desc' },
        take: 5, // Keep taking 5 for playground context
        select: {
          prompt: true,
          sqlQuery: true,
        },
      });
    } else {
      // Chat context: Get previous queries from today for this user and connection
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      previousQueries = await prisma.query.findMany({
        where: {
          userId,
          connectionId,
          playgroundId: null, // Ensure these are chat-specific queries
          createdAt: {
            gte: startOfToday,
          },
        },
        orderBy: { createdAt: 'asc' }, // Chronological for chat history context
        take: 10, // Take more for chat context if desired, e.g., 10
        select: {
          prompt: true,
          sqlQuery: true,
        },
      });
    }

    // Call OpenAI API to generate SQL
    const generatedQuery = await generateSqlWithOpenAI(prompt, schema, previousQueries, connection.type);

    // TODO: Implement DQL enforcement if enforceDQL is true and !playgroundId
    if (enforceDQL && !playgroundId) {
      // Add your DQL validation logic here. For example:
      // const isDQL = generatedQuery.query.trim().toUpperCase().startsWith('SELECT');
      // if (!isDQL) {
      //   throw new ApiError(400, 'Generated query is not a DQL query. Only SELECT statements are allowed in chat.');
      // }
      logger.info(`DQL enforcement requested for chat query. Generated query: ${generatedQuery.query}`);
    }

    // Save the query to the database
    const queryId = uuidv4();
    const queryData: any = {
      id: queryId,
      userId, // Store userId for all queries
      connectionId, // Store connectionId for all queries
      sandboxDbId: connection.sandboxDb?.id,
      prompt,
      // Format sqlQuery as a JSON string with the required prefix for frontend parsing
      sqlQuery: `json\n${JSON.stringify({ query: generatedQuery.query, explanation: generatedQuery.explanation }, null, 2)}`,
      //explanation: generatedQuery.explanation,
    };

    if (playgroundId) {
      queryData.playgroundId = playgroundId;
    }
    // If playgroundId is null, it's a chat query and won't be associated with a playground

    const newQuery = await prisma.query.create({
      data: queryData,
    });

    // If this is a playground chat, store both user and AI messages in ChatMessage
    if (playgroundId) {
      // User message
      await prisma.chatMessage.create({
        data: {
          playgroundId,
          userId,
          sender: 'user',
          message: prompt,
        },
      });
      // AI message
      await prisma.chatMessage.create({
        data: {
          playgroundId,
          userId,
          sender: 'ai',
          message: generatedQuery.explanation || '',
          sql: generatedQuery.query,
          queryId: newQuery.id,
        },
      });
    }

    res.status(201).json({
      success: true,
      data: {
        query: {
          ...newQuery,
          result: null, // Result is typically null on generation
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
    if (!query.playground || query.playground.userId !== userId) {
      throw new ApiError(403, 'Not authorized to execute this query');
    }
    // Use the hybrid query execution logic
    const connection = query.sandboxDb?.connection;
    console.log("connection", connection);
    if (!connection) {
      throw new ApiError(400, 'No database connection found for this query');
    }
    let result;
    try {
      result = await executeHybridQuery({
        userId,
        connection: {
          id: connection.id,
          type: connection.type,
          host: typeof connection.host === 'string' ? connection.host : undefined,
          port: typeof connection.port === 'number' ? connection.port : undefined,
          username: typeof connection.username === 'string' ? connection.username : undefined,
          password: typeof connection.password === 'string' ? connection.password : undefined,
          database: typeof connection.database === 'string' ? connection.database : undefined,
          connectionString: typeof connection.connectionString === 'string' ? connection.connectionString : undefined,
          options: connection.options,
        },
        sqlQuery
      });
      // Update the query with the result
      const updatedQuery = await prisma.query.update({
        where: { id: queryId },
        data: {
          sqlQuery,
          result: result as any,
          executionTime: result.executionTime,
        },
      });
      res.status(200).json({
        success: true,
        data: { query: updatedQuery },
      });
    } catch (error: any) {
      // Update the query with the error
      await prisma.query.update({
        where: { id: queryId },
        data: {
          sqlQuery,
          error: error.message,
        },
      });
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
    if (!query.playground || query.playground.userId !== userId) {
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
      model: process.env.USE_AZURE_OPENAI === 'true' 
        ? process.env.AZURE_OPENAI_MODEL_NAME || 'gpt-4o-mini'
        : 'gpt-3.5-turbo',
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