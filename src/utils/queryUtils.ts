import { QueryType, SandboxTableMeta } from './types';

// Simple query type detection (can be improved with a SQL parser)
export function getQueryType(query: string): QueryType {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.startsWith('select')) return 'DQL';
  if (trimmed.startsWith('insert') || trimmed.startsWith('update') || trimmed.startsWith('delete')) return 'DML';
  if (trimmed.startsWith('create') || trimmed.startsWith('alter') || trimmed.startsWith('drop') || trimmed.startsWith('truncate')) return 'DDL';
  return 'UNKNOWN';
}

// Naive table extraction from DML query (for demo; use a SQL parser for production)
export function extractAffectedTables(query: string): string[] {
  const lower = query.toLowerCase();
  let match;
  if (lower.startsWith('insert into')) {
    match = lower.match(/insert into\s+([`"\[]?\w+[`"\]]?)/);
    return match ? [match[1].replace(/[`"\[\]]/g, '')] : [];
  }
  if (lower.startsWith('update')) {
    match = lower.match(/update\s+([`"\[]?\w+[`"\]]?)/);
    return match ? [match[1].replace(/[`"\[\]]/g, '')] : [];
  }
  if (lower.startsWith('delete from')) {
    match = lower.match(/delete from\s+([`"\[]?\w+[`"\]]?)/);
    return match ? [match[1].replace(/[`"\[\]]/g, '')] : [];
  }
  return [];
}

// TTL check for sandboxed tables
export function isSandboxTableExpired(meta: SandboxTableMeta, ttlMinutes: number): boolean {
  const now = Date.now();
  const last = new Date(meta.lastCopied).getTime();
  return now - last > ttlMinutes * 60 * 1000;
} 