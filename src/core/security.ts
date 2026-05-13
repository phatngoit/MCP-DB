import type { BaseConnectionConfig, QueryResult, SecurityConfig } from '../types.js';
import { PermissionError, UserInputError } from './errors.js';

const READONLY_SQL_PREFIXES = ['select', 'with', 'explain'];
const SQL_WRITE_OR_DDL = /\b(insert|update|delete|merge|drop|alter|truncate|create|grant|revoke|exec|execute|call)\b/i;
const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|token|secret|api[_-]?key|credential)/i;

export function resolveLimit(
  security: SecurityConfig,
  connection: BaseConnectionConfig,
  requested?: number,
): number {
  const configured = connection.maxRows ?? security.defaultMaxRows;
  if (!requested) {
    return configured;
  }
  return Math.min(requested, configured);
}

export function validateSqlQuery(
  query: string,
  security: SecurityConfig,
  connection: BaseConnectionConfig,
): void {
  const normalized = query.trim().replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  if (!normalized) {
    throw new UserInputError('Query is empty.');
  }

  if (security.blockMultiStatement && hasMultipleStatements(normalized)) {
    throw new PermissionError('Multiple SQL statements are blocked by configuration.');
  }

  const firstWord = normalized.split(/\s+/, 1)[0]?.toLowerCase();
  if (connection.mode === 'readonly' || !security.allowWriteOperations) {
    if (!firstWord || !READONLY_SQL_PREFIXES.includes(firstWord) || SQL_WRITE_OR_DDL.test(normalized)) {
      throw new PermissionError('Only readonly SQL queries are allowed for this connection.');
    }
  }
}

export function validateMongoPipeline(
  pipeline: Record<string, unknown>[],
  security: SecurityConfig,
  connection: BaseConnectionConfig,
): void {
  if (!Array.isArray(pipeline)) {
    throw new UserInputError('MongoDB pipeline must be an array.');
  }

  const blockedStages = ['$out', '$merge'];
  if (connection.mode === 'readonly' || !security.allowWriteOperations) {
    for (const stage of pipeline) {
      for (const key of Object.keys(stage)) {
        if (blockedStages.includes(key)) {
          throw new PermissionError(`MongoDB stage ${key} is blocked in readonly mode.`);
        }
      }
    }
  }
}

export function assertAllowedObject(
  value: string,
  kind: 'schema' | 'table',
  connection: BaseConnectionConfig,
): void {
  const allow = kind === 'schema' ? connection.allowSchemas : connection.allowTables;
  const deny = kind === 'schema' ? connection.denySchemas : connection.denyTables;

  if (allow?.length && !allow.some((item) => equalsName(item, value))) {
    throw new PermissionError(`${kind} '${value}' is not in the allowlist.`);
  }

  if (deny?.some((item) => equalsName(item, value))) {
    throw new PermissionError(`${kind} '${value}' is blocked by the denylist.`);
  }
}

export function maskResult(result: QueryResult, security: SecurityConfig): QueryResult {
  return {
    ...result,
    rows: result.rows.map((row) => maskValue(row, security.maskColumns)),
  };
}

function hasMultipleStatements(query: string): boolean {
  const withoutTrailingSemicolon = query.replace(/;\s*$/, '');
  return withoutTrailingSemicolon.includes(';');
}

function equalsName(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function maskValue(value: unknown, configuredKeys: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, configuredKeys));
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, innerValue]) => {
        const configured = configuredKeys.some((item) => equalsName(item, key));
        if (configured || SENSITIVE_KEY_PATTERN.test(key)) {
          return [key, '[masked]'];
        }
        return [key, maskValue(innerValue, configuredKeys)];
      }),
    );
  }
  return value;
}
