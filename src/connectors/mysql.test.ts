import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockEnd, createPoolMock } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const createPoolMock = vi.fn().mockReturnValue({ query: mockQuery, end: mockEnd });
  return { mockQuery, mockEnd, createPoolMock };
});

vi.mock('mysql2/promise', () => ({
  default: { createPool: createPoolMock },
}));

const { MysqlConnector } = await import('./mysql.js');

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    type: 'mysql' as const,
    mode: 'readonly' as const,
    name: 'mysql_test',
    host: 'localhost',
    port: 3306,
    database: 'appdb',
    username: 'app_readonly',
    password: 'secret',
    ...overrides,
  };
}

describe('MysqlConnector', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEnd.mockReset();
    createPoolMock.mockClear();
  });

  it('creates the pool once and reuses it across calls', async () => {
    mockQuery.mockResolvedValue([[]]);
    const connector = new MysqlConnector(baseConfig());

    await connector.listSchemas();
    await connector.listSchemas();

    expect(createPoolMock).toHaveBeenCalledTimes(1);
  });

  it('uses a raw connection string when provided instead of structured fields', async () => {
    mockQuery.mockResolvedValue([[]]);
    const connector = new MysqlConnector(
      baseConfig({ connectionString: 'mysql://user:pass@host:3306/db', host: undefined }),
    );

    await connector.listSchemas();

    expect(createPoolMock).toHaveBeenCalledWith('mysql://user:pass@host:3306/db');
  });

  it('maps schema rows into a flat string array', async () => {
    mockQuery.mockResolvedValue([[{ schema_name: 'appdb' }, { schema_name: 'reporting' }]]);
    const connector = new MysqlConnector(baseConfig());

    const schemas = await connector.listSchemas();

    expect(schemas).toEqual(['appdb', 'reporting']);
  });

  it('aggregates multi-row index results into IndexInfo objects and treats non_unique=0 as unique', async () => {
    mockQuery
      .mockResolvedValueOnce([[{ column_name: 'id', data_type: 'int', is_nullable: 'NO', column_default: null }]])
      .mockResolvedValueOnce([[{ column_name: 'id' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [
          { index_name: 'PRIMARY', column_name: 'id', non_unique: 0, seq_in_index: 1 },
          { index_name: 'idx_email', column_name: 'email', non_unique: 1, seq_in_index: 1 },
        ],
      ]);

    const connector = new MysqlConnector(baseConfig());
    const description = await connector.describeTable('appdb', 'users');

    expect(description.indexes).toEqual([
      { name: 'PRIMARY', columns: ['id'], unique: true },
      { name: 'idx_email', columns: ['email'], unique: false },
    ]);
  });

  it('marks results truncated when more rows exist than maxRows', async () => {
    mockQuery.mockResolvedValue([[{ id: 1 }, { id: 2 }, { id: 3 }]]);
    const connector = new MysqlConnector(baseConfig());

    const result = await connector.query({ query: 'SELECT * FROM t', maxRows: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('parses a JSON string EXPLAIN column', async () => {
    mockQuery.mockResolvedValue([[{ EXPLAIN: JSON.stringify({ query_block: {} }) }]]);
    const connector = new MysqlConnector(baseConfig());

    const result = await connector.explainQuery({ query: 'SELECT 1' });

    expect(result.plan).toEqual([{ query_block: {} }]);
  });

  it('falls back to the raw string when EXPLAIN output is not valid JSON', async () => {
    mockQuery.mockResolvedValue([[{ EXPLAIN: 'not json' }]]);
    const connector = new MysqlConnector(baseConfig());

    const result = await connector.explainQuery({ query: 'SELECT 1' });

    expect(result.plan).toEqual(['not json']);
  });

  it('closes and clears the pool', async () => {
    mockQuery.mockResolvedValue([[]]);
    mockEnd.mockResolvedValue(undefined);
    const connector = new MysqlConnector(baseConfig());

    await connector.listSchemas();
    await connector.close();

    expect(mockEnd).toHaveBeenCalledTimes(1);

    await connector.listSchemas();
    expect(createPoolMock).toHaveBeenCalledTimes(2);
  });
});
