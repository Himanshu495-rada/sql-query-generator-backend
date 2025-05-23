import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import sqlite3 from 'sqlite3';
import { MongoClient, Db } from 'mongodb';
import { open as sqliteOpen } from 'sqlite';
import { DatabaseType } from '@prisma/client';
import { 
  DatabaseConfig, 
  TableInfo, 
  ColumnInfo, 
  DatabaseSchema,
  QueryResult
} from '../utils/types';
import { logger } from '../utils/logger';
import { ApiError } from '../middleware/errorHandler';

// Map of active connections by connection ID
const connections = new Map<string, any>();

/**
 * Connect to a database based on the provided configuration
 */
export const connectToDatabase = async (
  connectionId: string,
  config: DatabaseConfig
): Promise<void> => {
  try {
    // Close existing connection if it exists
    if (connections.has(connectionId)) {
      await closeDatabaseConnection(connectionId);
    }

    let connection;

    switch (config.type) {
      case DatabaseType.POSTGRESQL:
        connection = await connectToPostgres(config);
        break;
      
      case DatabaseType.MYSQL:
        connection = await connectToMysql(config);
        break;
      
      case DatabaseType.SQLITE:
        connection = await connectToSqlite(config);
        break;
      
      case DatabaseType.MONGODB:
        connection = await connectToMongoDB(config);
        break;
      
      default:
        throw new ApiError(400, `Unsupported database type: ${config.type}`);
    }

    // Store the connection
    connections.set(connectionId, {
      type: config.type,
      connection,
    });

    logger.info(`Successfully connected to ${config.type} database for connection ID: ${connectionId}`);
  } catch (error: any) {
    logger.error(`Failed to connect to database: ${error.message}`);
    throw new ApiError(500, `Failed to connect to database: ${error.message}`);
  }
};

/**
 * Connect to a PostgreSQL database
 */
const connectToPostgres = async (config: DatabaseConfig): Promise<Pool> => {
  const connectionConfig: any = {
    user: config.username,
    password: config.password,
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: config.options?.ssl || false,
  };

  // Use connection string if provided
  if (config.connectionString) {
    connectionConfig.connectionString = config.connectionString;
  }

  const pool = new Pool(connectionConfig);
  
  // Test the connection
  await pool.query('SELECT 1');
  
  return pool;
};

/**
 * Connect to a MySQL database
 */
const connectToMysql = async (config: DatabaseConfig): Promise<mysql.Pool> => {
  const connectionConfig: mysql.PoolOptions = {
    user: config.username,
    password: config.password,
    host: config.host,
    port: config.port,
    database: config.database,
    ssl: config.options?.ssl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };

  // Use connection string if provided
  if (config.connectionString) {
    return mysql.createPool(config.connectionString);
  }

  const pool = mysql.createPool(connectionConfig);
  
  // Test the connection
  const connection = await pool.getConnection();
  connection.release();
  
  return pool;
};

/**
 * Connect to a SQLite database
 */
const connectToSqlite = async (config: DatabaseConfig): Promise<any> => {
  if (!config.connectionString && !config.database) {
    throw new ApiError(400, 'SQLite requires a database file path');
  }

  const dbPath = config.connectionString || `${config.database}`;
  
  const db = await sqliteOpen({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Test the connection
  await db.get('SELECT 1');
  
  return db;
};

/**
 * Connect to a MongoDB database
 */
const connectToMongoDB = async (config: DatabaseConfig): Promise<{ client: MongoClient, db: Db }> => {
  const uri = config.connectionString || 
    `mongodb://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}`;
  
  const client = new MongoClient(uri, config.options);
  await client.connect();
  
  const db = client.db(config.database);
  
  // Test the connection
  await db.command({ ping: 1 });
  
  return { client, db };
};

/**
 * Close a database connection
 */
export const closeDatabaseConnection = async (connectionId: string): Promise<void> => {
  try {
    const connectionInfo = connections.get(connectionId);
    
    if (!connectionInfo) {
      return;
    }

    const { type, connection } = connectionInfo;

    switch (type) {
      case DatabaseType.POSTGRESQL:
        await connection.end();
        break;
      
      case DatabaseType.MYSQL:
        await connection.end();
        break;
      
      case DatabaseType.SQLITE:
        await connection.close();
        break;
      
      case DatabaseType.MONGODB:
        await connection.client.close();
        break;
    }

    connections.delete(connectionId);
    logger.info(`Closed database connection for ID: ${connectionId}`);
  } catch (error: any) {
    logger.error(`Error closing database connection: ${error.message}`);
  }
};

/**
 * Execute a query on a database
 */
export const executeQuery = async (
  connectionId: string,
  query: string
): Promise<QueryResult> => {
  const connectionInfo = connections.get(connectionId);
  
  if (!connectionInfo) {
    throw new ApiError(404, 'Database connection not found');
  }

  const { type, connection } = connectionInfo;
  const startTime = Date.now();
  
  try {
    let result: QueryResult;
    
    switch (type) {
      case DatabaseType.POSTGRESQL:
        result = await executePostgresQuery(connection, query);
        break;
      
      case DatabaseType.MYSQL:
        result = await executeMysqlQuery(connection, query);
        break;
      
      case DatabaseType.SQLITE:
        result = await executeSqliteQuery(connection, query);
        break;
      
      case DatabaseType.MONGODB:
        result = await executeMongoQuery(connection, query);
        break;
      
      default:
        throw new ApiError(400, `Unsupported database type: ${type}`);
    }

    const executionTime = Date.now() - startTime;
    return {
      ...result,
      executionTime,
    };
  } catch (error: any) {
    logger.error(`Query execution error: ${error.message}`);
    throw new ApiError(500, `Query execution error: ${error.message}`);
  }
};

/**
 * Execute a PostgreSQL query
 */
const executePostgresQuery = async (connection: Pool, query: string): Promise<QueryResult> => {
  const result = await connection.query(query);
  
  return {
    columns: result.fields?.map(field => field.name) || [],
    rows: result.rows || [],
    rowCount: result.rowCount || 0,
    executionTime: 0,
  };
};

/**
 * Execute a MySQL query
 */
const executeMysqlQuery = async (connection: mysql.Pool, query: string): Promise<QueryResult> => {
  const [rows, fields] = await connection.query(query);
  
  return {
    columns: fields?.map((field: any) => field.name) || [],
    rows: Array.isArray(rows) ? rows : [rows],
    rowCount: Array.isArray(rows) ? rows.length : 1,
    executionTime: 0,
  };
};

/**
 * Execute a SQLite query
 */
const executeSqliteQuery = async (connection: any, query: string): Promise<QueryResult> => {
  if (query.trim().toLowerCase().startsWith('select')) {
    const rows = await connection.all(query);
    
    // Extract column names from the first row
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: 0,
    };
  } else {
    const result = await connection.run(query);
    
    return {
      columns: [],
      rows: [],
      rowCount: result.changes,
      executionTime: 0,
    };
  }
};

/**
 * Execute a MongoDB query (using a JSON representation of a MongoDB command)
 */
const executeMongoQuery = async (connection: { db: Db }, query: string): Promise<QueryResult> => {
  try {
    // Parse the query string as JSON to get MongoDB command
    const command = JSON.parse(query);
    
    if (!command.collection) {
      throw new ApiError(400, 'MongoDB query must specify a collection');
    }

    const collection = connection.db.collection(command.collection);
    let result;
    let rows = [];
    
    // Execute the appropriate MongoDB operation
    switch (command.operation) {
      case 'find':
        result = await collection.find(command.filter || {}).toArray();
        rows = result;
        break;
      
      case 'findOne':
        result = await collection.findOne(command.filter || {});
        rows = result ? [result] : [];
        break;
      
      case 'insertOne':
        result = await collection.insertOne(command.document);
        rows = [{ insertedId: result.insertedId }];
        break;
      
      case 'insertMany':
        result = await collection.insertMany(command.documents);
        rows = [{ insertedCount: result.insertedCount }];
        break;
      
      case 'updateOne':
        result = await collection.updateOne(
          command.filter || {}, 
          command.update, 
          command.options
        );
        rows = [{ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }];
        break;
      
      case 'updateMany':
        result = await collection.updateMany(
          command.filter || {}, 
          command.update, 
          command.options
        );
        rows = [{ matchedCount: result.matchedCount, modifiedCount: result.modifiedCount }];
        break;
      
      case 'deleteOne':
        result = await collection.deleteOne(command.filter || {});
        rows = [{ deletedCount: result.deletedCount }];
        break;
      
      case 'deleteMany':
        result = await collection.deleteMany(command.filter || {});
        rows = [{ deletedCount: result.deletedCount }];
        break;
      
      case 'aggregate':
        result = await collection.aggregate(command.pipeline).toArray();
        rows = result;
        break;
      
      default:
        throw new ApiError(400, `Unsupported MongoDB operation: ${command.operation}`);
    }

    // Extract column names from the first row
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    
    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: 0,
    };
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, 'Invalid MongoDB query format. Must be valid JSON.');
    }
    throw error;
  }
};

/**
 * Get the schema information for a database
 */
export const getDatabaseSchema = async (
  connectionId: string
): Promise<DatabaseSchema> => {
  const connectionInfo = connections.get(connectionId);
  
  if (!connectionInfo) {
    throw new ApiError(404, 'Database connection not found');
  }

  const { type, connection } = connectionInfo;
  
  try {
    let schema: DatabaseSchema;
    
    switch (type) {
      case DatabaseType.POSTGRESQL:
        schema = await getPostgresSchema(connection);
        break;
      
      case DatabaseType.MYSQL:
        schema = await getMysqlSchema(connection);
        break;
      
      case DatabaseType.SQLITE:
        schema = await getSqliteSchema(connection);
        break;
      
      case DatabaseType.MONGODB:
        schema = await getMongoDBSchema(connection);
        break;
      
      default:
        throw new ApiError(400, `Unsupported database type: ${type}`);
    }

    return schema;
  } catch (error: any) {
    logger.error(`Error getting database schema: ${error.message}`);
    throw new ApiError(500, `Error getting database schema: ${error.message}`);
  }
};

/**
 * Get PostgreSQL database schema
 */
const getPostgresSchema = async (connection: Pool): Promise<DatabaseSchema> => {
  // Query to get all tables
  const tablesQuery = `
    SELECT table_name, table_schema
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name
  `;
  
  const tablesResult = await connection.query(tablesQuery);
  
  // Initialize schema with empty tables array
  const schema: DatabaseSchema = { tables: [] };
  
  // Process each table
  for (const table of tablesResult.rows) {
    // Query to get columns for this table with improved data type detection
    const columnsQuery = `
      SELECT 
        c.column_name, 
        c.data_type, 
        c.is_nullable = 'YES' as is_nullable,
        c.column_default,
        (
          SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
          FROM pg_catalog.pg_attribute a
          WHERE a.attrelid = (
            SELECT pg_catalog.pg_class.oid 
            FROM pg_catalog.pg_class 
            JOIN pg_catalog.pg_namespace ON pg_catalog.pg_namespace.oid = pg_catalog.pg_class.relnamespace
            WHERE pg_catalog.pg_class.relname = c.table_name 
            AND pg_catalog.pg_namespace.nspname = c.table_schema
          )
          AND a.attname = c.column_name
          AND NOT a.attisdropped
        ) as full_data_type
      FROM 
        information_schema.columns c
      WHERE 
        c.table_name = $1 AND 
        c.table_schema = $2
      ORDER BY 
        c.ordinal_position
    `;
    
    const columnsResult = await connection.query(columnsQuery, [
      table.table_name,
      table.table_schema
    ]);
    
    // Get primary key columns
    const pkQuery = `
      SELECT 
        c.column_name
      FROM 
        information_schema.table_constraints tc
      JOIN 
        information_schema.constraint_column_usage AS ccu 
        USING (constraint_schema, constraint_name)
      JOIN 
        information_schema.columns AS c 
        ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name 
        AND ccu.column_name = c.column_name
      WHERE 
        tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
    `;
    
    const pkResult = await connection.query(pkQuery, [
      table.table_name,
      table.table_schema
    ]);
    
    const primaryKeys = pkResult.rows.map(row => row.column_name);
    
    // Get foreign key constraints
    const fkQuery = `
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema as foreign_table_schema,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name,
        rc.update_rule,
        rc.delete_rule
      FROM
        information_schema.table_constraints AS tc
      JOIN
        information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN
        information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      JOIN
        information_schema.referential_constraints AS rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
      WHERE
        tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
        AND tc.table_schema = $2
    `;
    
    const fkResult = await connection.query(fkQuery, [
      table.table_name,
      table.table_schema
    ]);
    
    // Map columns to our schema format
    const columns: ColumnInfo[] = columnsResult.rows.map(col => {
      // Check if this is an auto-incrementing column using a sequence
      const isSerialColumn = col.full_data_type?.includes('serial') || 
                           (col.column_default && col.column_default.includes('nextval'));
      
      return {
        name: col.column_name,
        type: isSerialColumn ? 'serial' : col.data_type,
        nullable: col.is_nullable,
        defaultValue: col.column_default,
        isPrimaryKey: primaryKeys.includes(col.column_name),
        isForeignKey: fkResult.rows.some(fk => fk.column_name === col.column_name),
      };
    });
    
    // Create table info
    const tableInfo: TableInfo = {
      name: table.table_name,
      schema: table.table_schema,
      columns,
      primaryKey: primaryKeys,
    };
    
    schema.tables.push(tableInfo);
  }
  
  return schema;
};

/**
 * Get MySQL database schema
 */
const getMysqlSchema = async (connection: mysql.Pool): Promise<DatabaseSchema> => {
  // Query to get the current database name
  const [databaseResult] = await connection.query('SELECT DATABASE() as db');
  const dbName = databaseResult[0].db;
  
  // Query to get all tables
  const [tablesResult] = await connection.query(`
    SELECT 
      table_name, 
      table_schema
    FROM 
      information_schema.tables
    WHERE 
      table_schema = ?
      AND table_type = 'BASE TABLE'
    ORDER BY 
      table_name
  `, [dbName]);
  
  // Initialize schema with empty tables array
  const schema: DatabaseSchema = { tables: [] };
  
  // Process each table
  for (const table of tablesResult) {
    // Query to get columns for this table
    const [columnsResult] = await connection.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable = 'YES' as is_nullable,
        column_default,
        column_key
      FROM 
        information_schema.columns
      WHERE 
        table_name = ?
        AND table_schema = ?
      ORDER BY 
        ordinal_position
    `, [table.table_name, table.table_schema]);
    
    // Get primary key columns
    const primaryKeys = columnsResult
      .filter((col: any) => col.column_key === 'PRI')
      .map((col: any) => col.column_name);
    
    // Get foreign key constraints
    const [fkResult] = await connection.query(`
      SELECT
        constraint_name,
        column_name,
        referenced_table_schema,
        referenced_table_name,
        referenced_column_name
      FROM
        information_schema.key_column_usage
      WHERE
        referenced_table_name IS NOT NULL
        AND table_name = ?
        AND table_schema = ?
    `, [table.table_name, table.table_schema]);
    
    // Map columns to our schema format
    const columns: ColumnInfo[] = columnsResult.map((col: any) => ({
      name: col.column_name,
      type: col.data_type,
      nullable: col.is_nullable === 1,
      defaultValue: col.column_default,
      isPrimaryKey: primaryKeys.includes(col.column_name),
      isForeignKey: fkResult.some((fk: any) => fk.column_name === col.column_name),
    }));
    
    // Create table info
    const tableInfo: TableInfo = {
      name: table.table_name,
      schema: table.table_schema,
      columns,
      primaryKey: primaryKeys,
    };
    
    schema.tables.push(tableInfo);
  }
  
  return schema;
};

/**
 * Get SQLite database schema
 */
const getSqliteSchema = async (connection: any): Promise<DatabaseSchema> => {
  // Get all tables
  const tables = await connection.all(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `);
  
  // Initialize schema with empty tables array
  const schema: DatabaseSchema = { tables: [] };
  
  // Process each table
  for (const table of tables) {
    // Get table info
    const tableInfo = await connection.all(`PRAGMA table_info('${table.name}')`);
    
    // Get foreign keys
    const foreignKeys = await connection.all(`PRAGMA foreign_key_list('${table.name}')`);
    
    // Map columns to our schema format
    const columns: ColumnInfo[] = tableInfo.map(col => ({
      name: col.name,
      type: col.type,
      nullable: col.notnull === 0,
      defaultValue: col.dflt_value,
      isPrimaryKey: col.pk === 1,
      isForeignKey: foreignKeys.some(fk => fk.from === col.name),
    }));
    
    // Get primary key columns
    const primaryKeys = tableInfo
      .filter(col => col.pk === 1)
      .map(col => col.name);
    
    // Create table info
    const tableInfo2: TableInfo = {
      name: table.name,
      columns,
      primaryKey: primaryKeys,
    };
    
    schema.tables.push(tableInfo2);
  }
  
  return schema;
};

/**
 * Get MongoDB database schema (derived from collection contents)
 */
const getMongoDBSchema = async (connection: { db: Db }): Promise<DatabaseSchema> => {
  // Get all collections
  const collections = await connection.db.listCollections().toArray();
  
  // Initialize schema with empty tables array
  const schema: DatabaseSchema = { tables: [] };
  
  // Process each collection
  for (const collection of collections) {
    // Skip system collections
    if (collection.name.startsWith('system.')) {
      continue;
    }
    
    // Get a sample document to infer schema
    const sampleDocs = await connection.db
      .collection(collection.name)
      .find()
      .limit(10)
      .toArray();
    
    // Skip empty collections
    if (sampleDocs.length === 0) {
      continue;
    }
    
    // Combine all fields from sample documents
    const combinedFields = new Map<string, Set<string>>();
    
    for (const doc of sampleDocs) {
      const fields = extractMongoFields(doc);
      for (const [fieldName, fieldType] of fields) {
        if (!combinedFields.has(fieldName)) {
          combinedFields.set(fieldName, new Set());
        }
        combinedFields.get(fieldName)!.add(fieldType);
      }
    }
    
    // Convert fields to columns
    const columns: ColumnInfo[] = Array.from(combinedFields.entries()).map(([name, types]) => {
      const typeArray = Array.from(types);
      return {
        name,
        type: typeArray.length === 1 ? typeArray[0] : typeArray.join('|'),
        nullable: true,
        isPrimaryKey: name === '_id',
      };
    });
    
    // Create table info (collection)
    const tableInfo: TableInfo = {
      name: collection.name,
      columns,
      primaryKey: ['_id'],
    };
    
    schema.tables.push(tableInfo);
  }
  
  return schema;
};

/**
 * Extract field names and types from a MongoDB document
 */
const extractMongoFields = (
  doc: any,
  prefix = '',
  fields = new Map<string, string>()
): Map<string, string> => {
  if (doc === null || doc === undefined) {
    return fields;
  }

  if (Array.isArray(doc)) {
    if (doc.length > 0) {
      // Use the first element to infer type
      const fieldType = Array.isArray(doc[0]) 
        ? 'array'
        : (typeof doc[0] === 'object' && doc[0] !== null)
          ? 'object[]'
          : `${typeof doc[0]}[]`;
      
      fields.set(prefix.slice(0, -1), fieldType);
      
      // If it's an array of objects, extract its fields
      if (typeof doc[0] === 'object' && doc[0] !== null && !Array.isArray(doc[0])) {
        extractMongoFields(doc[0], `${prefix}items.`, fields);
      }
    } else {
      fields.set(prefix.slice(0, -1), 'array');
    }
  } else if (typeof doc === 'object') {
    for (const [key, value] of Object.entries(doc)) {
      const fieldPath = prefix + key;
      
      if (value === null) {
        fields.set(fieldPath, 'null');
      } else if (Array.isArray(value)) {
        extractMongoFields(value, `${fieldPath}.`, fields);
      } else if (typeof value === 'object') {
        fields.set(fieldPath, 'object');
        extractMongoFields(value, `${fieldPath}.`, fields);
      } else {
        fields.set(fieldPath, typeof value);
      }
    }
  }
  
  return fields;
}; 