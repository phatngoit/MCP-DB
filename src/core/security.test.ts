import { describe, expect, it } from 'vitest';
import type { BaseConnectionConfig, SecurityConfig } from '../types.js';
import {
  assertNonEmptyFilter,
  assertWriteAllowed,
  maskResult,
  resolveLimit,
  validateMongoPipeline,
  validateSqlQuery,
} from './security.js';

const security: SecurityConfig = {
  defaultMaxRows: 100,
  queryTimeoutMs: 10_000,
  blockMultiStatement: true,
  allowWriteOperations: false,
  maskColumns: ['password', 'token'],
};

const connection: BaseConnectionConfig = {
  type: 'mssql',
  mode: 'readonly',
};

describe('security guards', () => {
  it('allows readonly SQL', () => {
    expect(() => validateSqlQuery('select * from dbo.Users', security, connection)).not.toThrow();
  });

  it('blocks SQL writes', () => {
    expect(() => validateSqlQuery('delete from dbo.Users', security, connection)).toThrow(
      /readonly SQL/,
    );
  });

  it('blocks multiple SQL statements', () => {
    expect(() => validateSqlQuery('select 1; select 2', security, connection)).toThrow(
      /Multiple SQL/,
    );
  });

  it('blocks MongoDB write aggregate stages', () => {
    expect(() =>
      validateMongoPipeline([{ $match: {} }, { $merge: 'target' }], security, {
        type: 'mongodb',
        mode: 'readonly',
      }),
    ).toThrow(/\$merge/);
  });

  it('caps requested limit by configured max rows', () => {
    expect(resolveLimit(security, { ...connection, maxRows: 25 }, 50)).toBe(25);
  });

  it('masks sensitive fields recursively', () => {
    const result = maskResult(
      {
        rows: [{ id: 1, password: 'secret', profile: { api_key: 'abc', name: 'A' } }],
        rowCount: 1,
        truncated: false,
      },
      security,
    );
    expect(result.rows[0]).toEqual({
      id: 1,
      password: '[masked]',
      profile: { api_key: '[masked]', name: 'A' },
    });
  });

  it('blocks writes when the connection is readonly', () => {
    expect(() => assertWriteAllowed(security, { type: 'mongodb', mode: 'readonly' })).toThrow(
      /Write operations are blocked/,
    );
  });

  it('blocks writes when allowWriteOperations is false even in readwrite mode', () => {
    expect(() => assertWriteAllowed(security, { type: 'mongodb', mode: 'readwrite' })).toThrow(
      /Write operations are blocked/,
    );
  });

  it('allows writes when readwrite mode and allowWriteOperations are both set', () => {
    expect(() =>
      assertWriteAllowed(
        { ...security, allowWriteOperations: true },
        { type: 'mongodb', mode: 'readwrite' },
      ),
    ).not.toThrow();
  });

  it('rejects an empty filter to avoid affecting an entire collection', () => {
    expect(() => assertNonEmptyFilter({})).toThrow(/non-empty filter/);
  });

  it('accepts a non-empty filter', () => {
    expect(() => assertNonEmptyFilter({ _id: '123' })).not.toThrow();
  });
});
