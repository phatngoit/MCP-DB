import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockEnd, PoolMock } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const PoolMock = vi.fn().mockImplementation(function PoolCtor() {
    return { query: mockQuery, end: mockEnd };
  });
  return { mockQuery, mockEnd, PoolMock };
});

vi.mock('pg', () => ({
  default: { Pool: PoolMock },
}));

const { PostgresConnector } = await import('./postgres.js');

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    type: 'postgres' as const,
    mode: 'readonly' as const,
    name: 'pg_test',
    host: 'localhost',
    port: 5432,
    database: 'appdb',
    username: 'app_readonly',
    password: 'secret',
    ...overrides,
  };
}

describe('PostgresConnector', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnd.mockReset();
    PoolMock.mockClear();
  });

  it('creates the pool once and reuses it across calls', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const connector = new PostgresConnector(baseConfig());

    await connector.listSchemas();
    await connector.listSchemas();

    expect(PoolMock).toHaveBeenCalledTimes(1);
  });

  it('uses connectionString when provided instead of structured fields', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const connector = new PostgresConnector(
      baseConfig({ connectionString: 'postgres://user:pass@host:5432/db', host: undefined }),
    );

    await connector.listSchemas();

    expect(PoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: 'postgres://user:pass@host:5432/db' }),
    );
  });

  it('maps schema rows into a flat string array', async () => {
    mockQuery.mockResolvedValue({ rows: [{ schema_name: 'public' }, { schema_name: 'app' }] });
    const connector = new PostgresConnector(baseConfig());

    const schemas = await connector.listSchemas();

    expect(schemas).toEqual(['public', 'app']);
  });

  it('aggregates multi-row index results into IndexInfo objects', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null }] })
      .mockResolvedValueOnce({ rows: [{ column_name: 'id' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { index_name: 'users_pkey', column_name: 'id', is_unique: true, ordinal: 1 },
          { index_name: 'users_email_idx', column_name: 'email', is_unique: true, ordinal: 1 },
          { index_name: 'users_email_idx', column_name: 'tenant_id', is_unique: true, ordinal: 2 },
        ],
      });

    const connector = new PostgresConnector(baseConfig());
    const description = await connector.describeTable('public', 'users');

    expect(description.indexes).toEqual([
      { name: 'users_pkey', columns: ['id'], unique: true },
      { name: 'users_email_idx', columns: ['email', 'tenant_id'], unique: true },
    ]);
    expect(description.primaryKeys).toEqual(['id']);
  });

  it('marks results truncated when more rows exist than maxRows', async () => {
    mockQuery.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });
    const connector = new PostgresConnector(baseConfig());

    const result = await connector.query({ query: 'SELECT * FROM t', maxRows: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('does not mark results truncated when row count is within maxRows', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 1 }] });
    const connector = new PostgresConnector(baseConfig());

    const result = await connector.query({ query: 'SELECT * FROM t', maxRows: 100 });

    expect(result.truncated).toBe(false);
  });

  it('unwraps a single-row QUERY PLAN column for explainQuery', async () => {
    mockQuery.mockResolvedValue({ rows: [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Seq Scan' } }] }] });
    const connector = new PostgresConnector(baseConfig());

    const result = await connector.explainQuery({ query: 'SELECT * FROM t' });

    expect(result.format).toBe('rows');
    expect(result.plan).toEqual([{ Plan: { 'Node Type': 'Seq Scan' } }]);
  });

  it('closes and clears the pool', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    mockEnd.mockResolvedValue(undefined);
    const connector = new PostgresConnector(baseConfig());

    await connector.listSchemas();
    await connector.close();

    expect(mockEnd).toHaveBeenCalledTimes(1);

    await connector.listSchemas();
    expect(PoolMock).toHaveBeenCalledTimes(2);
  });
});
