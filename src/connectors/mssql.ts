import sql from 'mssql';
import type { ConnectionPool } from 'mssql';
import type {
  DbConnector,
  ExplainResult,
  MssqlConnectionConfig,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

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
    const request = pool.request();
    request.input('schema', sql.NVarChar, schema ?? 'dbo');
    request.input('table', sql.NVarChar, table);
    const result = await request.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT COLUMN_NAME AS column_name,
              DATA_TYPE AS data_type,
              IS_NULLABLE AS is_nullable,
              COLUMN_DEFAULT AS column_default
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = @table
        ORDER BY ORDINAL_POSITION`,
    );
    return {
      schema: schema ?? 'dbo',
      name: table,
      columns: (result.recordset ?? []).map((row) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
      })),
    };
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const pool = await this.getPool();
    const maxRows = input.maxRows ?? 100;
    const result = await pool.request().query(input.query);
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
      const result = await transaction.request().batch<{ StmtText: string }>(input.query);
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
      this.pool = await new sql.ConnectionPool({
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
      }).connect();
    }
    return this.pool;
  }
}
