import { DatabaseType } from '@prisma/client';

// Database types array for documentation
export const DATABASE_TYPES = [
  { 
    type: DatabaseType.POSTGRESQL, 
    name: 'PostgreSQL',
    supportsSandbox: true,
  },
  { 
    type: DatabaseType.MYSQL, 
    name: 'MySQL',
    supportsSandbox: true,
  },
  { 
    type: DatabaseType.SQLITE, 
    name: 'SQLite',
    supportsSandbox: true,
  },
  { 
    type: DatabaseType.MONGODB, 
    name: 'MongoDB',
    supportsSandbox: false,
  },
];

// Database connection configuration
export interface DatabaseConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  connectionString?: string;
  options?: Record<string, any>;
}

// Database schema information
export interface DatabaseSchema {
  tables: TableInfo[];
  views?: ViewInfo[];
  procedures?: ProcedureInfo[];
}

// Table information
export interface TableInfo {
  name: string;
  schema?: string;
  columns: ColumnInfo[];
  primaryKey?: string[];
  foreignKeys?: ForeignKeyInfo[];
  indexes?: IndexInfo[];
}

// Column information
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  isUnique?: boolean;
}

// Foreign key information
export interface ForeignKeyInfo {
  name?: string;
  columnNames: string[];
  referenceTable: string;
  referenceSchema?: string;
  referenceColumnNames: string[];
  onUpdate?: string;
  onDelete?: string;
}

// Index information
export interface IndexInfo {
  name: string;
  columnNames: string[];
  isUnique: boolean;
}

// View information
export interface ViewInfo {
  name: string;
  schema?: string;
  columns: ColumnInfo[];
  definition?: string;
}

// Stored procedure information
export interface ProcedureInfo {
  name: string;
  schema?: string;
  parameters?: ProcedureParameterInfo[];
  returnType?: string;
  definition?: string;
}

// Procedure parameter information
export interface ProcedureParameterInfo {
  name: string;
  type: string;
  mode?: 'IN' | 'OUT' | 'INOUT';
  defaultValue?: string;
}

// Database query result
export interface QueryResult {
  columns: string[];
  rows: any[];
  rowCount: number;
  executionTime: number;
}

// AI generated query result
export interface AIGeneratedQuery {
  query: string;
  explanation: string;
}

// Sandbox database status
export interface SandboxStatus {
  sandboxId: string;
  connectionId: string;
  isActive: boolean;
  lastSyncTime: Date;
}

// Schema relationship representation for GUI builder
export interface SchemaRelationship {
  fromTable: string;
  fromSchema?: string;
  fromColumn: string;
  toTable: string;
  toSchema?: string;
  toColumn: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
}

// GUI query builder column config
export interface GuiBuilderColumn {
  name: string;
  alias?: string;
  function?: string;
}

// GUI query builder filter config
export interface GuiBuilderFilter {
  column: string;
  operator: string;
  value: any;
}

// GUI query builder sort config
export interface GuiBuilderSort {
  column: string;
  direction: 'ASC' | 'DESC';
}

// GUI query builder configuration
export interface GuiBuilderConfig {
  table: string;
  tableSchema?: string;
  columns: GuiBuilderColumn[];
  filters?: GuiBuilderFilter[];
  sort?: GuiBuilderSort[];
  limit?: number;
  offset?: number;
  joins?: GuiBuilderJoin[];
}

// GUI query builder join configuration
export interface GuiBuilderJoin {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  tableSchema?: string;
  tableAlias?: string;
  conditions: {
    leftColumn: string;
    rightColumn: string;
  }[];
} 