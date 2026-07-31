import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExecute, mockConnectionClose, mockGetConnection, mockPoolClose, createPoolMock } = vi.hoisted(() => {
  const mockExecute = vi.fn();
  const mockConnectionClose = vi.fn().mockResolvedValue(undefined);
  const mockGetConnection = vi.fn().mockResolvedValue({
    execute: mockExecute,
    close: mockConnectionClose,
  });
  const mockPoolClose = vi.fn().mockResolvedValue(undefined);
  const createPoolMock = vi.fn().mockResolvedValue({
    getConnection: mockGetConnection,
    close: mockPoolClose,
  });
  return { mockExecute, mockConnectionClose, mockGetConnection, mockPoolClose, createPoolMock };
});

vi.mock('oracledb', () => ({
  default: {
    createPool: createPoolMock,
    OUT_FORMAT_OBJECT: 'OUT_FORMAT_OBJECT',
    DB_TYPE_CLOB: 'DB_TYPE_CLOB',
    DB_TYPE_NCLOB: 'DB_TYPE_NCLOB',
    DB_TYPE_VARCHAR: 'DB_TYPE_VARCHAR',
    thin: true,
    initOracleClient: vi.fn(),
  },
}));

const { OracleConnector } = await import('./oracle.js');

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    type: 'oracle' as const,
    mode: 'readonly' as const,
    name: 'oracle_test',
    host: 'localhost',
    port: 1521,
    serviceName: 'ORCLPDB1',
    username: 'app_readonly',
    password: 'secret',
    clientMode: 'thin' as const,
    ...overrides,
  };
}

describe('OracleConnector', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockConnectionClose.mockClear();
    mockGetConnection.mockClear();
    createPoolMock.mockClear();
  });

  it('creates the pool once and reuses it for multiple connections', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const connector = new OracleConnector(baseConfig());

    await connector.listSchemas();
    await connector.listSchemas();

    expect(createPoolMock).toHaveBeenCalledTimes(1);
    expect(mockGetConnection).toHaveBeenCalledTimes(2);
    expect(mockConnectionClose).toHaveBeenCalledTimes(2);
  });

  it('builds the connect string from host + serviceName', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const connector = new OracleConnector(baseConfig());

    await connector.listSchemas();

    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectString: 'localhost:1521/ORCLPDB1' }),
    );
  });

  it('builds the connect string from host + sid when serviceName is absent', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const connector = new OracleConnector(baseConfig({ serviceName: undefined, sid: 'ORCL' }));

    await connector.listSchemas();

    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectString: 'localhost:1521:ORCL' }),
    );
  });

  it('prefers a raw connectDescriptor over host/serviceName', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const connector = new OracleConnector(
      baseConfig({ connectDescriptor: '(DESCRIPTION=(HOST=x))', host: undefined, serviceName: undefined }),
    );

    await connector.listSchemas();

    expect(createPoolMock).toHaveBeenCalledWith(
      expect.objectContaining({ connectString: '(DESCRIPTION=(HOST=x))' }),
    );
  });

  it('throws when neither connectDescriptor nor host+serviceName/sid are configured', async () => {
    const connector = new OracleConnector(
      baseConfig({ host: undefined, serviceName: undefined, sid: undefined }),
    );

    await expect(connector.listSchemas()).rejects.toThrow(
      /requires either connectDescriptor, or host with serviceName\/sid/,
    );
  });

  it('maps listSchemas rows into a flat string array', async () => {
    mockExecute.mockResolvedValue({ rows: [{ USERNAME: 'APP_READONLY' }, { USERNAME: 'SYS' }] });
    const connector = new OracleConnector(baseConfig());

    const schemas = await connector.listSchemas();

    expect(schemas).toEqual(['APP_READONLY', 'SYS']);
  });

  it('aggregates multi-row index results into IndexInfo objects', async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [{ COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER', NULLABLE: 'N', DATA_DEFAULT: null }],
      })
      .mockResolvedValueOnce({ rows: [{ COLUMN_NAME: 'ID' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { INDEX_NAME: 'PK_USERS', COLUMN_NAME: 'ID', UNIQUENESS: 'UNIQUE', COLUMN_POSITION: 1 },
          { INDEX_NAME: 'IX_USERS_EMAIL', COLUMN_NAME: 'EMAIL', UNIQUENESS: 'NONUNIQUE', COLUMN_POSITION: 1 },
        ],
      });

    const connector = new OracleConnector(baseConfig());
    const description = await connector.describeTable('APP_READONLY', 'USERS');

    expect(description.indexes).toEqual([
      { name: 'PK_USERS', columns: ['ID'], unique: true },
      { name: 'IX_USERS_EMAIL', columns: ['EMAIL'], unique: false },
    ]);
    expect(description.primaryKeys).toEqual(['ID']);
  });

  it('marks query() results truncated once the row count reaches maxRows', async () => {
    mockExecute.mockResolvedValue({ rows: [{ ID: 1 }, { ID: 2 }] });
    const connector = new OracleConnector(baseConfig());

    const result = await connector.query({ query: 'SELECT * FROM users', maxRows: 2 });

    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('runs explainQuery via EXPLAIN PLAN + DBMS_XPLAN.DISPLAY', async () => {
    mockExecute
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ PLAN_TABLE_OUTPUT: 'Plan hash value: 123' }] });
    const connector = new OracleConnector(baseConfig());

    const result = await connector.explainQuery({ query: 'SELECT * FROM users' });

    expect(result.format).toBe('text');
    expect(result.plan).toEqual(['Plan hash value: 123']);
  });

  it('automatically casts NCHAR columns to VARCHAR2 and retries on a SELECT * query', async () => {
    const ncharError = new Error('ORA-12704: character set mismatch NLS_NCHAR_CHARACTERSET');
    mockExecute
      .mockRejectedValueOnce(ncharError)
      .mockResolvedValueOnce({
        rows: [
          { COLUMN_NAME: 'ID', DATA_TYPE: 'NUMBER' },
          { COLUMN_NAME: 'NAME', DATA_TYPE: 'NCHAR' },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ ID: 1, NAME: 'Alice' }] });

    const connector = new OracleConnector(baseConfig());
    const result = await connector.query({ query: 'SELECT * FROM USERS', maxRows: 100 });

    expect(result.rows).toEqual([{ ID: 1, NAME: 'Alice' }]);
    expect(mockExecute).toHaveBeenCalledTimes(3);
    const rewrittenQuery = mockExecute.mock.calls[2][0] as string;
    expect(rewrittenQuery).toContain('TO_CHAR("NAME") "NAME"');
  });

  it('rethrows the original NCHAR error when the query has no rewritable FROM clause', async () => {
    const ncharError = new Error('character set id mismatch');
    mockExecute.mockRejectedValueOnce(ncharError);

    const connector = new OracleConnector(baseConfig());

    await expect(
      connector.query({ query: 'SELECT * FROM (SELECT 1 FROM dual)', maxRows: 100 }),
    ).rejects.toThrow(/NCHAR character set.*AL16UTF16.*Thick mode/s);
  });

  it('closes and clears the pool', async () => {
    mockExecute.mockResolvedValue({ rows: [] });
    const connector = new OracleConnector(baseConfig());

    await connector.listSchemas();
    await connector.close();

    expect(mockPoolClose).toHaveBeenCalledTimes(1);

    await connector.listSchemas();
    expect(createPoolMock).toHaveBeenCalledTimes(2);
  });
});
