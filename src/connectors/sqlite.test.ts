import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPragma, mockPrepare, mockClose, mockGet, mockAll, DatabaseMock } = vi.hoisted(() => {
  const mockGet = vi.fn();
  const mockAll = vi.fn();
  const mockPragma = vi.fn();
  const mockClose = vi.fn();
  const mockPrepare = vi.fn(() => ({
    get: mockGet,
    all: mockAll,
  }));
  const DatabaseMock = vi.fn().mockImplementation(function DatabaseCtor() {
    return { pragma: mockPragma, prepare: mockPrepare, close: mockClose };
  });
  return { mockPragma, mockPrepare, mockClose, mockGet, mockAll, DatabaseMock };
});

vi.mock('better-sqlite3', () => ({
  default: DatabaseMock,
}));

const { SqliteConnector } = await import('./sqlite.js');

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    type: 'sqlite' as const,
    mode: 'readonly' as const,
    name: 'sqlite_test',
    file: './data/app.db',
    ...overrides,
  };
}

describe('SqliteConnector', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockAll.mockReset();
    mockPragma.mockReset();
    mockPrepare.mockClear();
    mockClose.mockReset();
    DatabaseMock.mockClear();
  });

  it('opens the database once and reuses it across calls', async () => {
    mockPragma.mockReturnValue([]);
    const connector = new SqliteConnector(baseConfig());

    await connector.listSchemas();
    await connector.listSchemas();

    expect(DatabaseMock).toHaveBeenCalledTimes(1);
  });

  it('opens in readonly mode when the connection mode is readonly', async () => {
    mockPragma.mockReturnValue([]);
    const connector = new SqliteConnector(baseConfig({ mode: 'readonly' }));

    await connector.listSchemas();

    expect(DatabaseMock).toHaveBeenCalledWith(
      './data/app.db',
      expect.objectContaining({ readonly: true }),
    );
  });

  it('opens writable when the connection mode is readwrite', async () => {
    mockPragma.mockReturnValue([]);
    const connector = new SqliteConnector(baseConfig({ mode: 'readwrite' }));

    await connector.listSchemas();

    expect(DatabaseMock).toHaveBeenCalledWith(
      './data/app.db',
      expect.objectContaining({ readonly: false }),
    );
  });

  it('maps database_list rows into a flat string array', async () => {
    mockPragma.mockReturnValue([
      { seq: 0, name: 'main', file: '/path/app.db' },
      { seq: 1, name: 'aux', file: '/path/aux.db' },
    ]);
    const connector = new SqliteConnector(baseConfig());

    const schemas = await connector.listSchemas();

    expect(schemas).toEqual(['main', 'aux']);
  });

  it('lists tables from sqlite_schema, defaulting to the main schema', async () => {
    mockAll.mockReturnValue([
      { name: 'users', type: 'table' },
      { name: 'orders', type: 'table' },
    ]);
    const connector = new SqliteConnector(baseConfig());

    const tables = await connector.listTables();

    expect(tables).toEqual([
      { schema: 'main', name: 'users', type: 'TABLE' },
      { schema: 'main', name: 'orders', type: 'TABLE' },
    ]);
    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('"main".sqlite_schema'));
  });

  it('aggregates index_list + index_info into IndexInfo objects and orders composite primary keys', async () => {
    mockPragma
      .mockReturnValueOnce([
        { cid: 0, name: 'tenant_id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 2 },
        { cid: 1, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1 },
        { cid: 2, name: 'email', type: 'TEXT', notnull: 0, dflt_value: null, pk: 0 },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ seq: 0, name: 'idx_users_email', unique: 1, origin: 'c', partial: 0 }])
      .mockReturnValueOnce([{ seqno: 0, cid: 2, name: 'email' }]);

    const connector = new SqliteConnector(baseConfig());
    const description = await connector.describeTable(undefined, 'users');

    expect(description.primaryKeys).toEqual(['id', 'tenant_id']);
    expect(description.indexes).toEqual([{ name: 'idx_users_email', columns: ['email'], unique: true }]);
    expect(description.columns).toEqual([
      { name: 'tenant_id', type: 'INTEGER', nullable: false, defaultValue: null },
      { name: 'id', type: 'INTEGER', nullable: false, defaultValue: null },
      { name: 'email', type: 'TEXT', nullable: true, defaultValue: null },
    ]);
  });

  it('marks query() results truncated when more rows exist than maxRows', async () => {
    mockAll.mockReturnValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const connector = new SqliteConnector(baseConfig());

    const result = await connector.query({ query: 'SELECT * FROM users', maxRows: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('binds params positionally to the prepared statement', async () => {
    mockAll.mockReturnValue([]);
    const connector = new SqliteConnector(baseConfig());

    await connector.query({ query: 'SELECT * FROM users WHERE id = ?', params: [42] });

    expect(mockAll).toHaveBeenCalledWith(42);
  });

  it('wraps the query in EXPLAIN QUERY PLAN for explainQuery', async () => {
    mockAll.mockReturnValue([{ id: 0, parent: 0, notused: 0, detail: 'SCAN users' }]);
    const connector = new SqliteConnector(baseConfig());

    const result = await connector.explainQuery({ query: 'SELECT * FROM users' });

    expect(mockPrepare).toHaveBeenCalledWith('EXPLAIN QUERY PLAN SELECT * FROM users');
    expect(result.format).toBe('rows');
    expect(result.plan).toEqual([{ id: 0, parent: 0, notused: 0, detail: 'SCAN users' }]);
  });

  it('closes and clears the database handle', async () => {
    mockPragma.mockReturnValue([]);
    const connector = new SqliteConnector(baseConfig());

    await connector.listSchemas();
    await connector.close();

    expect(mockClose).toHaveBeenCalledTimes(1);

    await connector.listSchemas();
    expect(DatabaseMock).toHaveBeenCalledTimes(2);
  });
});
