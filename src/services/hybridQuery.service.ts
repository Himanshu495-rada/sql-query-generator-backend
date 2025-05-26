import { prisma } from "../index";
import * as databaseService from "./database.service";
import {
  getQueryType,
  extractAffectedTables,
  isSandboxTableExpired,
} from "../utils/queryUtils";
import { DatabaseConfig, QueryResult, SandboxTableMeta } from "../utils/types";

// Main hybrid query execution function
export async function executeHybridQuery({
  userId,
  connection,
  sqlQuery,
}: {
  userId: string;
  connection: any; // Prisma connection object
  sqlQuery: string;
}): Promise<QueryResult> {
  // 1. Get user settings for TTL
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const ttlMinutes =
    settings &&
    "sandboxTtlMinutes" in settings &&
    settings.sandboxTtlMinutes != null
      ? settings.sandboxTtlMinutes
      : 60;

  // 2. Detect query type
  const queryType = getQueryType(sqlQuery);

  // Run DQL, on sanbox DB if it exists, otherwise on source DB
  if (queryType === "DQL" && connection.sandboxDbId) {
    // Check if sandbox DB exists
    const sandbox = await prisma.sandboxDb.findUnique({
      where: { id: connection.sandboxDbId },
    });
    if (sandbox) {
      // Connect to sandbox DB
      const sandboxConfig: DatabaseConfig = {
        type: connection.type,
        host: sandbox.host || connection.host,
        port: sandbox.port || connection.port,
        username: sandbox.username || connection.username,
        password: sandbox.password || connection.password,
        database: sandbox.name,
        connectionString: sandbox.connectionString ?? undefined,
        options: connection.options,
      };
      const sandboxConnId = `sandbox_${sandbox.id}`;
      await databaseService.connectToDatabase(sandboxConnId, sandboxConfig);
      try {
        return await databaseService.executeQuery(sandboxConnId, sqlQuery);
      } finally {
        await databaseService.closeDatabaseConnection(sandboxConnId);
      }
    }
    // If no sandbox DB, fall through to source DB logic
  } else if (queryType === "DQL" && !connection.sandboxDbId) {
    console.log(
      `No sandbox DB for connection ${connection.id}, running query on source DB`
    );
    const config: DatabaseConfig = {
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      database: connection.database,
      connectionString: connection.connectionString ?? undefined,
      options: connection.options,
    };
    await databaseService.connectToDatabase(connection.id, config);
    try {
      return await databaseService.executeQuery(connection.id, sqlQuery);
    } finally {
      await databaseService.closeDatabaseConnection(connection.id);
    }
  } else if (queryType === "DML") {
    // Find or create sandbox DB for this connection
    console.log(`Checking sandbox DB for connection ${connection.id}`);
    let sandbox = await prisma.sandboxDb.findUnique({
      where: { connectionId: connection.id },
    });
    if (!sandbox) {
      // Create empty sandbox DB (schema only, no data)
      // You may want to call your existing createSandboxDatabase with schema only
      throw new Error("Sandbox DB must be created before running DML queries.");
    }
    // Connect to sandbox DB
    const sandboxConfig: DatabaseConfig = {
      type: connection.type,
      host: sandbox.host || connection.host,
      port: sandbox.port || connection.port,
      username: sandbox.username || connection.username,
      password: sandbox.password || connection.password,
      database: sandbox.name,
      connectionString: sandbox.connectionString ?? undefined,
      options: connection.options,
    };
    const sandboxConnId = `sandbox_${sandbox.id}`;
    await databaseService.connectToDatabase(sandboxConnId, sandboxConfig);

    // Track table copy times in a metadata table in the sandbox DB
    // (You may want to create a table like _sandbox_meta if not exists)
    // For demo, assume a function ensureSandboxMetaTable exists
    await ensureSandboxMetaTable(sandboxConnId, connection.type);

    // 5. For each affected table, check TTL and copy if needed
    const affectedTables = extractAffectedTables(sqlQuery);
    for (const table of affectedTables) {
      const meta = await getSandboxTableMeta(
        sandboxConnId,
        table,
        connection.type
      );
      if (!meta || isSandboxTableExpired(meta, Number(ttlMinutes))) {
        // Copy schema and data for this table from source to sandbox
        await copyTableToSandbox(
          connection,
          sandboxConnId,
          table,
          connection.type
        );
        await updateSandboxTableMeta(sandboxConnId, table, connection.type);
      }
    }

    // 6. Run the DML query on the sandbox
    const result = await databaseService.executeQuery(sandboxConnId, sqlQuery);
    await databaseService.closeDatabaseConnection(sandboxConnId);
    return result;
  }

  throw new Error("Unsupported query type.");
}

// --- Helper functions ---

async function ensureSandboxMetaTable(sandboxConnId: string, dbType: string) {
  // Create a metadata table if it doesn't exist
  let query = "";
  if (dbType === "POSTGRESQL") {
    query = `CREATE TABLE IF NOT EXISTS _sandbox_meta (table_name TEXT PRIMARY KEY, last_copied TIMESTAMP)`;
  } else if (dbType === "MYSQL") {
    query =
      "CREATE TABLE IF NOT EXISTS _sandbox_meta (table_name VARCHAR(255) PRIMARY KEY, last_copied DATETIME)";
  } else if (dbType === "SQLITE") {
    query =
      "CREATE TABLE IF NOT EXISTS _sandbox_meta (table_name TEXT PRIMARY KEY, last_copied TEXT)";
  }
  if (query) {
    await databaseService.executeQuery(sandboxConnId, query);
  }
}

async function getSandboxTableMeta(
  sandboxConnId: string,
  table: string,
  dbType: string
): Promise<SandboxTableMeta | null> {
  let query = "";
  if (dbType === "POSTGRESQL" || dbType === "SQLITE") {
    query = `SELECT table_name, last_copied FROM _sandbox_meta WHERE table_name = '${table}'`;
  } else if (dbType === "MYSQL") {
    query = `SELECT table_name, last_copied FROM _sandbox_meta WHERE table_name = '${table}'`;
  }
  const result = await databaseService.executeQuery(sandboxConnId, query);
  if (result.rows.length > 0) {
    return {
      tableName: result.rows[0].table_name,
      lastCopied: new Date(result.rows[0].last_copied),
    };
  }
  return null;
}

async function updateSandboxTableMeta(
  sandboxConnId: string,
  table: string,
  dbType: string
) {
  let query = "";
  if (dbType === "POSTGRESQL" || dbType === "SQLITE") {
    query = `INSERT INTO _sandbox_meta (table_name, last_copied) VALUES ('${table}', CURRENT_TIMESTAMP)
      ON CONFLICT (table_name) DO UPDATE SET last_copied = CURRENT_TIMESTAMP`;
  } else if (dbType === "MYSQL") {
    query = `INSERT INTO _sandbox_meta (table_name, last_copied) VALUES ('${table}', NOW())
      ON DUPLICATE KEY UPDATE last_copied = NOW()`;
  }
  if (query) {
    await databaseService.executeQuery(sandboxConnId, query);
  }
}

async function copyTableToSandbox(
  sourceConnection: any,
  sandboxConnId: string,
  table: string,
  dbType: string
) {
  // 1. Get schema for the table (assume you have a function to get schema for a single table)
  // 2. Create the table in the sandbox if not exists
  // 3. Copy all rows from source to sandbox
  // (You can reuse your previous logic for this, but scoped to a single table)
  // For brevity, this is left as a TODO for now.
}
