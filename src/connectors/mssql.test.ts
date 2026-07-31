import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockClose, mockConnect, ConnectionPoolMock, TransactionMock, transactionState } =
  vi.hoisted(() => {
    const mockQuery = vi.fn();
    const mockClose = vi.fn();

    function requestFactory() {
      return {
        input: vi.fn().mockReturnThis(),
        query: mockQuery,
      };
    }

    const poolInstance: Record<string, unknown> = {
      request: vi.fn(() => requestFactory()),
      close: mockClose,
    };
    const mockConnect = vi.fn().mockResolvedValue(poolInstance);
    poolInstance.connect = mockConnect;

    const ConnectionPoolMock = vi.fn().mockImplementation(function ConnectionPoolCtor() {
      return poolInstance;
    });

    const transactionState = {
      begin: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      request: vi.fn(() => ({
        batch: vi.fn().mockResolvedValue(undefined),
        query: mockQuery,
      })),
    };
    const TransactionMock = vi.fn().mockImplementation(function TransactionCtor() {
      return transactionState;
    });

    return {
      mockQuery,
      mockClose,
      mockConnect,
      ConnectionPoolMock,
      TransactionMock,
      transactionState,
    };
  });

vi.mock('mssql', () => ({
  default: {
    NVarChar: 'NVarChar',
    ConnectionPool: ConnectionPoolMock,
    Transaction: TransactionMock,
  },
}));

const { MssqlConnector } = await import('./mssql.js');

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    type: 'mssql' as const,
    mode: 'readonly' as const,
    name: 'mssql_test',
    host: 'localhost',
    port: 1433,
    database: 'appdb',
    username: 'sa',
    password: 'secret',
    encrypt: true,
    trustServerCertificate: true,
    ...overrides,
  };
}

describe('MssqlConnector', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClose.mockReset();
    mockConnect.mockClear();
    ConnectionPoolMock.mockClear();
    transactionState.begin.mockClear();
    transactionState.rollback.mockClear();
  });

  it('creates the pool once and reuses it across calls', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const connector = new MssqlConnector(baseConfig());

    await connector.listSchemas();
    await connector.listSchemas();

    expect(ConnectionPoolMock).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('uses connectionString when provided instead of structured fields', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    const connector = new MssqlConnector(
      baseConfig({ connectionString: 'Server=host;Database=db;', host: undefined }),
    );

    await connector.listSchemas();

    expect(ConnectionPoolMock).toHaveBeenCalledWith('Server=host;Database=db;');
  });

  it('maps schema rows into a flat string array', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ name: 'dbo' }, { name: 'reporting' }] });
    const connector = new MssqlConnector(baseConfig());

    const schemas = await connector.listSchemas();

    expect(schemas).toEqual(['dbo', 'reporting']);
  });

  it('aggregates multi-row index results into IndexInfo objects', async () => {
    mockQuery
      .mockResolvedValueOnce({ recordset: [{ column_name: 'id', data_type: 'int', is_nullable: 'NO', column_default: null }] })
      .mockResolvedValueOnce({ recordset: [{ column_name: 'id' }] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({
        recordset: [
          { index_name: 'PK_users', column_name: 'id', is_unique: true, key_ordinal: 1 },
          { index_name: 'IX_users_email', column_name: 'email', is_unique: false, key_ordinal: 1 },
        ],
      })
      .mockResolvedValueOnce({ recordset: [{ column_name: 'id', comment: 'Primary key' }] });

    const connector = new MssqlConnector(baseConfig());
    const description = await connector.describeTable('dbo', 'users');

    expect(description.indexes).toEqual([
      { name: 'PK_users', columns: ['id'], unique: true },
      { name: 'IX_users_email', columns: ['email'], unique: false },
    ]);
    expect(description.primaryKeys).toEqual(['id']);
    expect(description.columns[0]).toMatchObject({ name: 'id', comment: 'Primary key' });
  });

  it('marks results truncated when more rows exist than maxRows', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const connector = new MssqlConnector(baseConfig());

    const result = await connector.query({ query: 'SELECT * FROM t', maxRows: 2 });

    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it('runs explainQuery inside a transaction and rolls it back', async () => {
    mockQuery.mockResolvedValue({ recordset: [{ StmtText: 'Table Scan' }] });
    const connector = new MssqlConnector(baseConfig());

    const result = await connector.explainQuery({ query: 'SELECT * FROM t' });

    expect(transactionState.begin).toHaveBeenCalledTimes(1);
    expect(transactionState.rollback).toHaveBeenCalledTimes(1);
    expect(result.plan).toEqual([{ StmtText: 'Table Scan' }]);
  });

  it('closes and clears the pool', async () => {
    mockQuery.mockResolvedValue({ recordset: [] });
    mockClose.mockResolvedValue(undefined);
    const connector = new MssqlConnector(baseConfig());

    await connector.listSchemas();
    await connector.close();

    expect(mockClose).toHaveBeenCalledTimes(1);

    await connector.listSchemas();
    expect(ConnectionPoolMock).toHaveBeenCalledTimes(2);
  });
});
