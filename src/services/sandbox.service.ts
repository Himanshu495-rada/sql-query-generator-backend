import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import { open as sqliteOpen } from 'sqlite';
import sqlite3 from 'sqlite3';
import { prisma } from '../index';
import { logger } from '../utils/logger';
import { ApiError } from '../middleware/errorHandler';
import { 
  DatabaseConfig, 
  DatabaseSchema, 
  TableInfo, 
  SandboxStatus,
} from '../utils/types';
import { DatabaseType } from '@prisma/client';
import * as databaseService from './database.service';
import * as fs from 'fs';
import * as path from 'path';

// Sandbox database names prefix
const SANDBOX_PREFIX = process.env.SANDBOX_DB_PREFIX || 'sandbox_';

// Default sandbox credentials
const SANDBOX_DEFAULTS = {
  host: process.env.SANDBOX_DB_HOST || 'localhost',
  port: parseInt(process.env.SANDBOX_DB_PORT || '5432'),
  username: process.env.SANDBOX_DB_USER || 'sandbox_user',
  password: process.env.SANDBOX_DB_PASSWORD || 'sandbox_password',
};

/**
 * Create a sandbox database based on a source database
 */
export const createSandboxDatabase = async (
  connectionId: string,
  sourceConfig: DatabaseConfig,
  schema: DatabaseSchema
): Promise<any> => {
  try {
    // Check if connection exists
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new ApiError(404, 'Connection not found');
    }

    // Check if sandbox already exists
    const existingSandbox = await prisma.sandboxDb.findUnique({
      where: { connectionId },
    });

    if (existingSandbox) {
      return existingSandbox;
    }

    // Create a sandbox database
    let sandboxConfig: DatabaseConfig;
    const sandboxName = `${SANDBOX_PREFIX}${connection.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;

    switch (sourceConfig.type) {
      case DatabaseType.POSTGRESQL:
        sandboxConfig = await createPostgresSandboxDb(sandboxName, sourceConfig, schema);
        break;
      
      case DatabaseType.MYSQL:
        sandboxConfig = await createMySqlSandboxDb(sandboxName, sourceConfig, schema);
        break;
      
      case DatabaseType.SQLITE:
        sandboxConfig = await createSqliteSandboxDb(sandboxName, sourceConfig, schema);
        break;
      
      default:
        throw new ApiError(400, `Sandbox creation not supported for ${sourceConfig.type}`);
    }

    // Save sandbox info to database
    const sandboxId = uuidv4();
    const sandboxDb = await prisma.sandboxDb.create({
      data: {
        id: sandboxId,
        name: sandboxName,
        connectionId,
        host: sandboxConfig.host,
        port: sandboxConfig.port,
        username: sandboxConfig.username,
        password: sandboxConfig.password,
        connectionString: sandboxConfig.connectionString,
        schema: schema as any,
      },
      select: {
        id: true,
        name: true,
        connectionId: true,
        host: true,
        port: true,
        connectionString: true,
        createdAt: true,
      },
    });

    logger.info(`Created sandbox database ${sandboxName} for connection ${connectionId}`);
    return sandboxDb;
  } catch (error: any) {
    logger.error(`Error creating sandbox database: ${error.message}`);
    throw new ApiError(500, `Failed to create sandbox database: ${error.message}`);
  }
};

/**
 * Create a PostgreSQL sandbox database
 */
const createPostgresSandboxDb = async (
  sandboxName: string, 
  sourceConfig: DatabaseConfig,
  schema: DatabaseSchema
): Promise<DatabaseConfig> => {
  // Connect to PostgreSQL server
  const adminConfig: DatabaseConfig = {
    type: DatabaseType.POSTGRESQL,
    host: SANDBOX_DEFAULTS.host,
    port: SANDBOX_DEFAULTS.port,
    username: SANDBOX_DEFAULTS.username,
    password: SANDBOX_DEFAULTS.password,
    database: 'postgres', // Connect to default database
  };

  const adminConnId = `admin_conn_${Date.now()}`;
  await databaseService.connectToDatabase(adminConnId, adminConfig);

  try {
    const adminPoolData = await databaseService.executeQuery(
      adminConnId, 
      `CREATE DATABASE ${sandboxName};`
    );

    // Create a new connection to the sandbox database
    const sandboxConfig: DatabaseConfig = {
      type: DatabaseType.POSTGRESQL,
      host: SANDBOX_DEFAULTS.host,
      port: SANDBOX_DEFAULTS.port,
      username: SANDBOX_DEFAULTS.username,
      password: SANDBOX_DEFAULTS.password,
      database: sandboxName,
    };

    const sandboxConnId = `sandbox_conn_${Date.now()}`;
    await databaseService.connectToDatabase(sandboxConnId, sandboxConfig);

    // Create schema
    try {
      // Create tables
      for (const table of schema.tables) {
        // Skip system tables
        if (table.name.startsWith('pg_') || table.name.startsWith('information_schema')) {
          continue;
        }

        const createTableQuery = generatePostgresCreateTableQuery(table);
        await databaseService.executeQuery(sandboxConnId, createTableQuery);
      }

      // Clone sample data if source database is accessible
      if (sourceConfig.host && sourceConfig.database) {
        // TODO: Implement data cloning logic for sample data
      }
    } finally {
      await databaseService.closeDatabaseConnection(sandboxConnId);
    }

    return sandboxConfig;
  } finally {
    await databaseService.closeDatabaseConnection(adminConnId);
  }
};

/**
 * Create a MySQL sandbox database
 */
const createMySqlSandboxDb = async (
  sandboxName: string, 
  sourceConfig: DatabaseConfig,
  schema: DatabaseSchema
): Promise<DatabaseConfig> => {
  // Connect to MySQL server
  const adminConfig: DatabaseConfig = {
    type: DatabaseType.MYSQL,
    host: SANDBOX_DEFAULTS.host,
    port: SANDBOX_DEFAULTS.port,
    username: SANDBOX_DEFAULTS.username,
    password: SANDBOX_DEFAULTS.password,
  };

  const adminConnId = `admin_conn_${Date.now()}`;
  await databaseService.connectToDatabase(adminConnId, adminConfig);

  try {
    await databaseService.executeQuery(
      adminConnId, 
      `CREATE DATABASE IF NOT EXISTS ${sandboxName};`
    );

    // Create a new connection to the sandbox database
    const sandboxConfig: DatabaseConfig = {
      type: DatabaseType.MYSQL,
      host: SANDBOX_DEFAULTS.host,
      port: SANDBOX_DEFAULTS.port,
      username: SANDBOX_DEFAULTS.username,
      password: SANDBOX_DEFAULTS.password,
      database: sandboxName,
    };

    const sandboxConnId = `sandbox_conn_${Date.now()}`;
    await databaseService.connectToDatabase(sandboxConnId, sandboxConfig);

    // Create schema
    try {
      // Create tables
      for (const table of schema.tables) {
        const createTableQuery = generateMySqlCreateTableQuery(table);
        await databaseService.executeQuery(sandboxConnId, createTableQuery);
      }

      // Clone sample data if source database is accessible
      if (sourceConfig.host && sourceConfig.database) {
        // TODO: Implement data cloning logic for sample data
      }
    } finally {
      await databaseService.closeDatabaseConnection(sandboxConnId);
    }

    return sandboxConfig;
  } finally {
    await databaseService.closeDatabaseConnection(adminConnId);
  }
};

/**
 * Create a SQLite sandbox database
 */
const createSqliteSandboxDb = async (
  sandboxName: string, 
  sourceConfig: DatabaseConfig,
  schema: DatabaseSchema
): Promise<DatabaseConfig> => {
  // Create SQLite database file
  const sandboxDir = path.resolve('./sandbox');
  if (!fs.existsSync(sandboxDir)) {
    fs.mkdirSync(sandboxDir, { recursive: true });
  }

  const dbPath = path.join(sandboxDir, `${sandboxName}.db`);
  const sandboxConfig: DatabaseConfig = {
    type: DatabaseType.SQLITE,
    connectionString: dbPath,
  };

  // Create the database
  const db = await sqliteOpen({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    // Create tables
    for (const table of schema.tables) {
      const createTableQuery = generateSqliteCreateTableQuery(table);
      await db.exec(createTableQuery);
    }

    // Clone sample data if source database is accessible
    if (sourceConfig.connectionString || sourceConfig.database) {
      // TODO: Implement data cloning logic for sample data
    }
  } finally {
    await db.close();
  }

  return sandboxConfig;
};

/**
 * Generate a PostgreSQL CREATE TABLE query from table info
 */
const generatePostgresCreateTableQuery = (table: TableInfo): string => {
  // First create any needed sequences for auto-incrementing columns
  let sequenceQueries = '';
  
  // Identify columns that need sequences (likely auto-increment/serial columns)
  const columnsNeedingSequences = table.columns.filter(col => 
    col.defaultValue?.includes('nextval') || 
    col.type.toLowerCase().includes('serial')
  );
  
  // Generate sequence creation statements
  for (const col of columnsNeedingSequences) {
    const sequenceName = `${table.name}_${col.name}_seq`;
    sequenceQueries += `CREATE SEQUENCE IF NOT EXISTS "${table.schema || 'public'}"."${sequenceName}";\n`;
  }
  
  // Generate main table creation query
  const columns = table.columns.map(col => {
    let nullable = col.nullable ? 'NULL' : 'NOT NULL';
    let defaultValue = col.defaultValue ? `DEFAULT ${col.defaultValue}` : '';
    
    // Replace nextval references with our explicitly created sequences
    if (defaultValue.includes('nextval')) {
      const sequenceName = `${table.name}_${col.name}_seq`;
      defaultValue = `DEFAULT nextval('"${table.schema || 'public'}"."${sequenceName}"')`;
    }
    
    return `"${col.name}" ${mapToPostgresType(col.type)} ${nullable} ${defaultValue}`.trim();
  });

  let query = sequenceQueries;
  query += `CREATE TABLE "${table.schema || 'public'}"."${table.name}" (\n`;
  query += columns.join(',\n');

  // Add primary key
  if (table.primaryKey && table.primaryKey.length > 0) {
    query += `,\nPRIMARY KEY ("${table.primaryKey.join('", "')}")`;
  }

  query += '\n);';
  return query;
};

/**
 * Generate a MySQL CREATE TABLE query from table info
 */
const generateMySqlCreateTableQuery = (table: TableInfo): string => {
  const columns = table.columns.map(col => {
    const nullable = col.nullable ? 'NULL' : 'NOT NULL';
    const defaultValue = col.defaultValue ? `DEFAULT ${col.defaultValue}` : '';
    return `\`${col.name}\` ${mapToMySqlType(col.type)} ${nullable} ${defaultValue}`.trim();
  });

  let query = `CREATE TABLE \`${table.name}\` (\n`;
  query += columns.join(',\n');

  // Add primary key
  if (table.primaryKey && table.primaryKey.length > 0) {
    query += `,\nPRIMARY KEY (\`${table.primaryKey.join('`, `')}\`)`;
  }

  query += '\n);';
  return query;
};

/**
 * Generate a SQLite CREATE TABLE query from table info
 */
const generateSqliteCreateTableQuery = (table: TableInfo): string => {
  const columns = table.columns.map(col => {
    const nullable = col.nullable ? '' : 'NOT NULL';
    const defaultValue = col.defaultValue ? `DEFAULT ${col.defaultValue}` : '';
    return `"${col.name}" ${mapToSqliteType(col.type)} ${nullable} ${defaultValue}`.trim();
  });

  let query = `CREATE TABLE "${table.name}" (\n`;
  query += columns.join(',\n');

  // Add primary key
  if (table.primaryKey && table.primaryKey.length > 0) {
    query += `,\nPRIMARY KEY ("${table.primaryKey.join('", "')}")`;
  }

  query += '\n);';
  return query;
};

/**
 * Map a generic type to PostgreSQL type
 */
const mapToPostgresType = (type: string): string => {
  // Base mapping for common types
  switch (type.toLowerCase()) {
    case 'int':
    case 'integer':
      return 'INTEGER';
    case 'bigint':
      return 'BIGINT';
    case 'smallint':
      return 'SMALLINT';
    case 'float':
    case 'double':
      return 'DOUBLE PRECISION';
    case 'decimal':
    case 'numeric':
      return 'NUMERIC';
    case 'char':
      return 'CHAR';
    case 'varchar':
    case 'string':
      return 'VARCHAR(255)';
    case 'text':
      return 'TEXT';
    case 'date':
      return 'DATE';
    case 'time':
      return 'TIME';
    case 'timestamp':
    case 'datetime':
      return 'TIMESTAMP';
    case 'boolean':
    case 'bool':
      return 'BOOLEAN';
    case 'json':
      return 'JSONB';
    case 'blob':
    case 'binary':
      return 'BYTEA';
    default:
      // For complex types or unknown types, default to TEXT
      return 'TEXT';
  }
};

/**
 * Map a generic type to MySQL type
 */
const mapToMySqlType = (type: string): string => {
  // Base mapping for common types
  switch (type.toLowerCase()) {
    case 'int':
    case 'integer':
      return 'INT';
    case 'bigint':
      return 'BIGINT';
    case 'smallint':
      return 'SMALLINT';
    case 'float':
      return 'FLOAT';
    case 'double':
      return 'DOUBLE';
    case 'decimal':
    case 'numeric':
      return 'DECIMAL(10,2)';
    case 'char':
      return 'CHAR';
    case 'varchar':
    case 'string':
      return 'VARCHAR(255)';
    case 'text':
      return 'TEXT';
    case 'date':
      return 'DATE';
    case 'time':
      return 'TIME';
    case 'timestamp':
    case 'datetime':
      return 'DATETIME';
    case 'boolean':
    case 'bool':
      return 'TINYINT(1)';
    case 'json':
      return 'JSON';
    case 'blob':
    case 'binary':
      return 'BLOB';
    default:
      // For complex types or unknown types, default to TEXT
      return 'TEXT';
  }
};

/**
 * Map a generic type to SQLite type
 */
const mapToSqliteType = (type: string): string => {
  // SQLite has only 5 basic types: NULL, INTEGER, REAL, TEXT, and BLOB
  switch (type.toLowerCase()) {
    case 'int':
    case 'integer':
    case 'bigint':
    case 'smallint':
    case 'tinyint':
      return 'INTEGER';
    case 'float':
    case 'double':
    case 'decimal':
    case 'numeric':
    case 'real':
      return 'REAL';
    case 'char':
    case 'varchar':
    case 'text':
    case 'string':
    case 'date':
    case 'time':
    case 'timestamp':
    case 'datetime':
    case 'json':
      return 'TEXT';
    case 'blob':
    case 'binary':
      return 'BLOB';
    case 'boolean':
    case 'bool':
      return 'INTEGER'; // SQLite doesn't have a boolean type, use INTEGER
    default:
      // For complex types or unknown types, default to TEXT
      return 'TEXT';
  }
};

/**
 * Delete a sandbox database
 */
export const deleteSandboxDatabase = async (sandboxId: string): Promise<void> => {
  try {
    // Get sandbox info
    const sandbox = await prisma.sandboxDb.findUnique({
      where: { id: sandboxId },
      include: {
        connection: true,
      },
    });

    if (!sandbox) {
      throw new ApiError(404, 'Sandbox database not found');
    }

    // Drop the sandbox database
    switch (sandbox.connection.type) {
      case DatabaseType.POSTGRESQL:
        await dropPostgresSandboxDb(sandbox.name);
        break;
      
      case DatabaseType.MYSQL:
        await dropMySqlSandboxDb(sandbox.name);
        break;
      
      case DatabaseType.SQLITE:
        await dropSqliteSandboxDb(sandbox.connectionString || `${sandbox.name}.db`);
        break;
      
      default:
        logger.warn(`No drop method for sandbox type ${sandbox.connection.type}`);
    }

    // Delete the sandbox record
    await prisma.sandboxDb.delete({
      where: { id: sandboxId },
    });

    logger.info(`Deleted sandbox database ${sandbox.name}`);
  } catch (error: any) {
    logger.error(`Error deleting sandbox database: ${error.message}`);
    throw new ApiError(500, `Failed to delete sandbox database: ${error.message}`);
  }
};

/**
 * Drop a PostgreSQL sandbox database
 */
const dropPostgresSandboxDb = async (dbName: string): Promise<void> => {
  // Connect to PostgreSQL server
  const adminConfig: DatabaseConfig = {
    type: DatabaseType.POSTGRESQL,
    host: SANDBOX_DEFAULTS.host,
    port: SANDBOX_DEFAULTS.port,
    username: SANDBOX_DEFAULTS.username,
    password: SANDBOX_DEFAULTS.password,
    database: 'postgres', // Connect to default database
  };

  const adminConnId = `admin_conn_${Date.now()}`;
  await databaseService.connectToDatabase(adminConnId, adminConfig);

  try {
    // Force disconnect all connections to the database
    await databaseService.executeQuery(
      adminConnId,
      `
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = '${dbName}'
        AND pid <> pg_backend_pid();
      `
    );

    // Drop the database
    await databaseService.executeQuery(adminConnId, `DROP DATABASE IF EXISTS ${dbName};`);
  } finally {
    await databaseService.closeDatabaseConnection(adminConnId);
  }
};

/**
 * Drop a MySQL sandbox database
 */
const dropMySqlSandboxDb = async (dbName: string): Promise<void> => {
  // Connect to MySQL server
  const adminConfig: DatabaseConfig = {
    type: DatabaseType.MYSQL,
    host: SANDBOX_DEFAULTS.host,
    port: SANDBOX_DEFAULTS.port,
    username: SANDBOX_DEFAULTS.username,
    password: SANDBOX_DEFAULTS.password,
  };

  const adminConnId = `admin_conn_${Date.now()}`;
  await databaseService.connectToDatabase(adminConnId, adminConfig);

  try {
    // Drop the database
    await databaseService.executeQuery(adminConnId, `DROP DATABASE IF EXISTS ${dbName};`);
  } finally {
    await databaseService.closeDatabaseConnection(adminConnId);
  }
};

/**
 * Drop a SQLite sandbox database
 */
const dropSqliteSandboxDb = async (dbPath: string): Promise<void> => {
  // For SQLite, we just delete the file
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
};

/**
 * Get the status of a sandbox database
 */
export const getSandboxStatus = async (connectionId: string): Promise<SandboxStatus | null> => {
  try {
    const sandbox = await prisma.sandboxDb.findUnique({
      where: { connectionId },
      select: {
        id: true,
        connectionId: true,
        updatedAt: true,
      },
    });

    if (!sandbox) {
      return null;
    }

    return {
      sandboxId: sandbox.id,
      connectionId: sandbox.connectionId,
      isActive: true,
      lastSyncTime: sandbox.updatedAt,
    };
  } catch (error: any) {
    logger.error(`Error getting sandbox status: ${error.message}`);
    throw new ApiError(500, `Failed to get sandbox status: ${error.message}`);
  }
}; 