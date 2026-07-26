import sql from 'mssql';
import type { ConnectionPool, Request } from 'mssql';
import type {
  DbConnector,
  ExplainResult,
  ForeignKeyInfo,
  IndexInfo,
  MssqlConnectionConfig,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

/**
 * MSSQL has no positional bind syntax, so params are bound as @p1, @p2, ...
 * (1-indexed) matching their array order; the query text must reference them
 * by those names.
 */
function bindPositionalParams(request: Request, params: unknown[] | undefined): void {
  (params ?? []).forEach((value, index) => {
    request.input(`p${index + 1}`, value);
  });
}

export class MssqlConnector implements DbConnector {
  readonly type = 'mssql' as const;
  readonly name: string;
  private pool?: ConnectionPool;

  constructor(private readonly config: MssqlConnectionConfig) {
    this.name = config.name ?? 'mssql';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const pool = await this.getPool();
    await pool.request().query('SELECT 1 AS ok');
    return { ok: true, message: 'Microsoft SQL Server connection succeeded.' };
  }

  async listSchemas(): Promise<string[]> {
    const pool = await this.getPool();
    const result = await pool.request().query<{ name: string }>(
      `SELECT name FROM sys.schemas ORDER BY name`,
    );
    return (result.recordset ?? []).map((row) => row.name);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const pool = await this.getPool();
    const request = pool.request();
    request.input('schema', sql.NVarChar, schema ?? null);
    const result = await request.query<{ schema_name: string; table_name: string; table_type: string }>(
      `SELECT TABLE_SCHEMA AS schema_name, TABLE_NAME AS table_name, TABLE_TYPE AS table_type
         FROM INFORMATION_SCHEMA.TABLES
        WHERE (@schema IS NULL OR TABLE_SCHEMA = @schema)
        ORDER BY TABLE_SCHEMA, TABLE_NAME`,
    );
    return (result.recordset ?? []).map((row) => ({
      schema: row.schema_name,
      name: row.table_name,
      type: row.table_type,
    }));
  }

  async describeTable(schema: string | undefined, table: string): Promise<TableDescription> {
    const pool = await this.getPool();
    const schemaName = schema ?? 'dbo';

    const [colResult, pkResult, fkResult, idxResult] = await Promise.all([
      // Columns
      pool.request()
        .input('schema', sql.NVarChar, schemaName)
        .input('table', sql.NVarChar, table)
        .query<{ column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(
          `SELECT COLUMN_NAME AS column_name,
                  DATA_TYPE AS data_type,
                  IS_NULLABLE AS is_nullable,
                  COLUMN_DEFAULT AS column_default
             FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
            ORDER BY ORDINAL_POSITION`,
        ),

      // Primary Keys
      pool.request()
        .input('schema', sql.NVarChar, schemaName)
        .input('table', sql.NVarChar, table)
        .query<{ column_name: string }>(
          `SELECT kcu.COLUMN_NAME AS column_name
             FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
               ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
              AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
              AND tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @table
            ORDER BY kcu.ORDINAL_POSITION`,
        ),

      // Foreign Keys
      pool.request()
        .input('schema', sql.NVarChar, schemaName)
        .input('table', sql.NVarChar, table)
        .query<{ column_name: string; ref_schema: string; ref_table: string; ref_column: string }>(
          `SELECT kcu.COLUMN_NAME AS column_name,
                  kcu2.TABLE_SCHEMA AS ref_schema,
                  kcu2.TABLE_NAME AS ref_table,
                  kcu2.COLUMN_NAME AS ref_column
             FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
               ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
              AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
             JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
               ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
             JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu2
               ON rc.UNIQUE_CONSTRAINT_NAME = kcu2.CONSTRAINT_NAME
              AND rc.UNIQUE_CONSTRAINT_SCHEMA = kcu2.TABLE_SCHEMA
            WHERE tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
              AND tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @table`,
        ),

      // Indexes
      pool.request()
        .input('schema', sql.NVarChar, schemaName)
        .input('table', sql.NVarChar, table)
        .query<{ index_name: string; column_name: string; is_unique: boolean; key_ordinal: number }>(
          `SELECT i.name AS index_name,
                  c.name AS column_name,
                  i.is_unique,
                  ic.key_ordinal
             FROM sys.indexes i
             JOIN sys.tables t  ON i.object_id = t.object_id
             JOIN sys.schemas s ON t.schema_id = s.schema_id
             JOIN sys.index_columns ic
               ON i.object_id = ic.object_id AND i.index_id = ic.index_id
             JOIN sys.columns c
               ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE s.name = @schema AND t.name = @table AND i.type > 0
            ORDER BY i.name, ic.key_ordinal`,
        ),
    ]);

    // Aggregate index rows â†’ IndexInfo[]
    const indexMap = new Map<string, IndexInfo>();
    for (const row of idxResult.recordset ?? []) {
      if (!indexMap.has(row.index_name)) {
        indexMap.set(row.index_name, { name: row.index_name, columns: [], unique: row.is_unique });
      }
      indexMap.get(row.index_name)!.columns.push(row.column_name);
    }

    return {
      schema: schemaName,
      name: table,
      columns: (colResult.recordset ?? []).map((r) => ({
        name: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable === 'YES',
        defaultValue: r.column_default,
      })),
      primaryKeys: (pkResult.recordset ?? []).map((r) => r.column_name),
      foreignKeys: (fkResult.recordset ?? []).map((r) => ({
        column: r.column_name,
        refSchema: r.ref_schema,
        refTable: r.ref_table,
        refColumn: r.ref_column,
      })) as ForeignKeyInfo[],
      indexes: [...indexMap.values()],
    };
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const pool = await this.getPool();
    const maxRows = input.maxRows ?? 100;
    const request = pool.request();
    bindPositionalParams(request, input.params);
    const result = await request.query(input.query);
    const recordset = result.recordset ?? [];
    const rows = recordset.slice(0, maxRows) as unknown[];
    return {
      rows,
      rowCount: rows.length,
      truncated: recordset.length > maxRows,
    };
  }

  async explainQuery(input: QueryInput): Promise<ExplainResult> {
    const pool = await this.getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await transaction.request().batch('SET SHOWPLAN_TEXT ON');
      const request = transaction.request();
      bindPositionalParams(request, input.params);
      const result = await request.query<{ StmtText: string }>(input.query);
      await transaction.request().batch('SET SHOWPLAN_TEXT OFF');
      await transaction.rollback();
      return {
        format: 'rows',
        plan: result.recordsets?.flat() ?? result.recordset ?? [],
      };
    } catch (error) {
      await transaction.request().batch('SET SHOWPLAN_TEXT OFF').catch(() => undefined);
      await transaction.rollback().catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
  }

  private async getPool(): Promise<ConnectionPool> {
    if (!this.pool) {
      const hasConnectionString = Boolean(
        this.config.connectionString || this.config.connectionStringEnv,
      );
      const poolConfig = hasConnectionString
        ? readSecret(this.config.connectionString, this.config.connectionStringEnv)
        : {
            server: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.username,
            password: readSecret(this.config.password, this.config.passwordEnv),
            requestTimeout: this.config.queryTimeoutMs,
            options: {
              encrypt: this.config.encrypt,
              trustServerCertificate: this.config.trustServerCertificate,
            },
            pool: {
              min: 0,
              max: 4,
            },
          };
      this.pool = await new sql.ConnectionPool(poolConfig).connect();
    }
    return this.pool;
  }
}
