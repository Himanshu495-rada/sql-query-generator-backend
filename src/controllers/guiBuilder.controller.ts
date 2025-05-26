import { Request, Response, NextFunction } from "express";
import { prisma } from "../index";
import { ApiError } from "../middleware/errorHandler";
import * as databaseService from "../services/database.service";
import * as hybridQueryService from "../services/hybridQuery.service";
import { SchemaRelationship, GuiBuilderConfig } from "../utils/types";

// Get database schema for GUI builder
export const getDatabaseSchemaForBuilder = async (
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
      include: {
        sandboxDb: true,
      },
    });

    if (!connection) {
      throw new ApiError(404, "Connection not found");
    }

    // Get database schema
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
        throw new ApiError(500, "Failed to get database schema");
      }
    }

    // Extract tables and relationships
    const tables = schema.tables.map((table) => ({
      name: table.name,
      schema: table.schema,
      columns: table.columns.map((col) => ({
        name: col.name,
        type: col.type,
        isPrimaryKey: col.isPrimaryKey,
        isForeignKey: col.isForeignKey,
      })),
    }));

    // Detect relationships
    const relationships = detectRelationships(schema);

    res.status(200).json({
      success: true,
      data: {
        tables,
        relationships,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Generate SQL from GUI builder configuration
export const generateSqlFromGuiConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    const { connectionId, config } = req.body;

    if (!connectionId) {
      throw new ApiError(400, "Connection ID is required");
    }

    if (!config) {
      throw new ApiError(400, "Builder configuration is required");
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

    // Generate SQL based on builder configuration
    const sql = generateSqlFromConfig(config, connection.type);

    res.status(200).json({
      success: true,
      data: { sql },
    });
  } catch (error) {
    next(error);
  }
};

// Get sample queries for a table
export const getSampleQueriesForTable = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const connectionId = req.params.connectionId;
    const tableName = req.params.tableName;

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

    // Generate sample queries for the table
    const sampleQueries = generateSampleQueries(tableName, connection.type);

    res.status(200).json({
      success: true,
      data: { sampleQueries },
    });
  } catch (error) {
    next(error);
  }
};

// Execute SQL query directly for GUI Builder
export const executeQuery = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { connectionId, sqlQuery } = req.body;

    if (!userId) {
      throw new ApiError(401, "Authentication required");
    }

    if (!connectionId || !sqlQuery) {
      throw new ApiError(400, "Connection ID and SQL query are required");
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
      throw new ApiError(404, "Connection not found");
    }

    // Execute query using hybrid query service
    const result = await hybridQueryService.executeHybridQuery({
      userId,
      connection,
      sqlQuery,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error executing GUI Builder query:", error);
    if (error instanceof ApiError) {
      next(error);
    } else {
      next(new ApiError(500, "Failed to execute query", error));
    }
  }
};

/**
 * Detect relationships between tables in a database schema
 */
const detectRelationships = (schema: any): SchemaRelationship[] => {
  const relationships: SchemaRelationship[] = [];

  // Basic relationship detection
  for (const table of schema.tables) {
    // Skip system tables
    if (
      table.name.startsWith("pg_") ||
      table.name.startsWith("information_schema")
    ) {
      continue;
    }

    // Look for foreign keys in columns
    for (const column of table.columns) {
      if (column.isForeignKey) {
        // For simplicity, we assume the foreign key points to the primary key of another table
        // In a real implementation, this would need more sophisticated detection

        // Look for a table where this column could be a reference
        for (const potentialParentTable of schema.tables) {
          // Skip the same table
          if (potentialParentTable.name === table.name) {
            continue;
          }

          // Look for a primary key that matches the naming pattern
          const potentialPrimaryKey = potentialParentTable.columns.find(
            (col) => col.isPrimaryKey
          );

          if (potentialPrimaryKey) {
            const columnNameLower = column.name.toLowerCase();
            const tableLower = potentialParentTable.name.toLowerCase();
            const primaryKeyLower = potentialPrimaryKey.name.toLowerCase();

            // Check if column name follows common patterns like table_id, tableId, etc.
            if (
              columnNameLower === primaryKeyLower ||
              columnNameLower === `${tableLower}_${primaryKeyLower}` ||
              columnNameLower ===
                `${tableLower}${
                  primaryKeyLower.charAt(0).toUpperCase() +
                  primaryKeyLower.slice(1)
                }`
            ) {
              relationships.push({
                fromTable: table.name,
                fromSchema: table.schema,
                fromColumn: column.name,
                toTable: potentialParentTable.name,
                toSchema: potentialParentTable.schema,
                toColumn: potentialPrimaryKey.name,
                type: "many-to-one",
              });
            }
          }
        }
      }
    }
  }

  return relationships;
};

/**
 * Generate SQL from GUI builder configuration
 */
const generateSqlFromConfig = (
  config: GuiBuilderConfig,
  databaseType: string
): string => {
  const { table, columns, filters, sort, limit } = config;

  if (!table || !columns || columns.length === 0) {
    throw new ApiError(400, "Table and at least one column must be specified");
  }

  // Generate SELECT clause
  const selectClause = columns
    .map((column) => {
      if (column.alias) {
        return `${table}.${column.name} AS ${column.alias}`;
      }
      return `${table}.${column.name}`;
    })
    .join(", ");

  // Generate WHERE clause
  let whereClause = "";
  if (filters && filters.length > 0) {
    whereClause =
      "WHERE " +
      filters
        .map((filter) => {
          const operator = getOperator(filter.operator, databaseType);

          // Handle different value types
          let value;
          if (filter.value === null) {
            return `${table}.${filter.column} IS NULL`;
          } else if (typeof filter.value === "string") {
            value = `'${filter.value.replace(/'/g, "''")}'`;
          } else {
            value = filter.value;
          }

          return `${table}.${filter.column} ${operator} ${value}`;
        })
        .join(" AND ");
  }

  // Generate ORDER BY clause
  let orderByClause = "";
  if (sort && sort.length > 0) {
    orderByClause =
      "ORDER BY " +
      sort
        .map((s) => {
          return `${table}.${s.column} ${s.direction || "ASC"}`;
        })
        .join(", ");
  }

  // Generate LIMIT clause
  let limitClause = "";
  if (limit !== undefined && limit !== null) {
    limitClause = `LIMIT ${limit}`;
  }

  // Combine all clauses
  return `SELECT ${selectClause}
FROM ${table}
${whereClause}
${orderByClause}
${limitClause}`.trim();
};

/**
 * Convert operator string to database-specific syntax
 */
const getOperator = (operator: string, databaseType: string): string => {
  switch (operator) {
    case "eq":
      return "=";
    case "neq":
      return "!=";
    case "gt":
      return ">";
    case "gte":
      return ">=";
    case "lt":
      return "<";
    case "lte":
      return "<=";
    case "like":
      return "LIKE";
    case "notLike":
      return "NOT LIKE";
    case "in":
      return "IN";
    case "notIn":
      return "NOT IN";
    case "between":
      return "BETWEEN";
    case "isNull":
      return "IS NULL";
    case "isNotNull":
      return "IS NOT NULL";
    default:
      return "=";
  }
};

/**
 * Generate sample queries for a table
 */
const generateSampleQueries = (
  tableName: string,
  databaseType: string
): { name: string; description: string; sql: string }[] => {
  return [
    {
      name: "Select All",
      description: "Retrieve all records from the table",
      sql: `SELECT * FROM ${tableName};`,
    },
    {
      name: "Count All",
      description: "Count the number of records in the table",
      sql: `SELECT COUNT(*) FROM ${tableName};`,
    },
    {
      name: "Filter Example",
      description: "Filter records with a basic condition",
      sql: `SELECT * FROM ${tableName} WHERE id = 1;`,
    },
    {
      name: "Sort Example",
      description: "Sort records by a column",
      sql: `SELECT * FROM ${tableName} ORDER BY id DESC;`,
    },
    {
      name: "Limit Example",
      description: "Limit the number of returned records",
      sql: `SELECT * FROM ${tableName} LIMIT 10;`,
    },
    {
      name: "Paging Example",
      description: "Implement basic pagination",
      sql: `SELECT * FROM ${tableName} LIMIT 10 OFFSET 10;`,
    },
    {
      name: "Join Example",
      description: "Join with a related table (adjust table name as needed)",
      sql: `SELECT a.*, b.name 
FROM ${tableName} a
JOIN related_table b ON a.related_id = b.id;`,
    },
    {
      name: "Group By Example",
      description: "Group records and aggregate",
      sql: `SELECT column_name, COUNT(*) 
FROM ${tableName}
GROUP BY column_name;`,
    },
    {
      name: "Insert Example",
      description: "Insert a new record",
      sql: `INSERT INTO ${tableName} (column1, column2)
VALUES ('value1', 'value2');`,
    },
    {
      name: "Update Example",
      description: "Update existing records",
      sql: `UPDATE ${tableName}
SET column1 = 'new_value'
WHERE id = 1;`,
    },
    {
      name: "Delete Example",
      description: "Delete records with a condition",
      sql: `DELETE FROM ${tableName}
WHERE id = 1;`,
    },
  ];
};
