import mysql from 'mysql2/promise';
import type {
  DbConnector,
  ExplainResult,
  ForeignKeyInfo,
  IndexInfo,
  MysqlConnectionConfig,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

const SYSTEM_SCHEMAS = ['mysql', 'information_schema', 'performance_schema', 'sys'];

export class MysqlConnector implements DbConnector {
  readonly type = 'mysql' as const;
  readonly name: string;
  private pool?: mysql.Pool;

  constructor(private readonly config: MysqlConnectionConfig) {
    this.name = config.name ?? 'mysql';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const pool = this.getPool();
    await pool.query({ sql: 'SELECT 1', timeout: this.config.queryTimeoutMs });
    return { ok: true, message: 'MySQL/MariaDB connection succeeded.' };
  }

  async listSchemas(): Promise<string[]> {
    const pool = this.getPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT schema_name AS schema_name
         FROM information_schema.schemata
        WHERE schema_name NOT IN (${SYSTEM_SCHEMAS.map(() => '?').join(', ')})
        ORDER BY schema_name`,
      SYSTEM_SCHEMAS,
    );
    return rows.map((row) => row.schema_name as string);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const pool = this.getPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      `SELECT table_schema, table_name, table_type
         FROM information_schema.tables
        WHERE (? IS NULL OR table_schema = ?)
          AND table_schema NOT IN (${SYSTEM_SCHEMAS.map(() => '?').join(', ')})
        ORDER BY table_schema, table_name`,
      [schema ?? null, schema ?? null, ...SYSTEM_SCHEMAS],
    );
    return rows.map((row) => ({
      schema: row.table_schema as string,
      name: row.table_name as string,
      type: row.table_type as string,
    }));
  }

  async describeTable(schema: string | undefined, table: string): Promise<TableDescription> {
    const pool = this.getPool();
    const schemaName = schema ?? this.config.database ?? 'public';

    const [[colRows], [pkRows], [fkRows], [idxRows]] = await Promise.all([
      pool.query<mysql.RowDataPacket[]>(
        `SELECT column_name, data_type, is_nullable, column_default, column_comment
           FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ?
          ORDER BY ordinal_position`,
        [schemaName, table],
      ),
      pool.query<mysql.RowDataPacket[]>(
        `SELECT column_name
           FROM information_schema.key_column_usage
          WHERE table_schema = ? AND table_name = ? AND constraint_name = 'PRIMARY'
          ORDER BY ordinal_position`,
        [schemaName, table],
      ),
      pool.query<mysql.RowDataPacket[]>(
        `SELECT column_name,
                referenced_table_schema AS ref_schema,
                referenced_table_name AS ref_table,
                referenced_column_name AS ref_column
           FROM information_schema.key_column_usage
          WHERE table_schema = ? AND table_name = ? AND referenced_table_name IS NOT NULL`,
        [schemaName, table],
      ),
      pool.query<mysql.RowDataPacket[]>(
        `SELECT index_name, column_name, non_unique, seq_in_index
           FROM information_schema.statistics
          WHERE table_schema = ? AND table_name = ?
          ORDER BY index_name, seq_in_index`,
        [schemaName, table],
      ),
    ]);

    const indexMap = new Map<string, IndexInfo>();
    for (const row of idxRows) {
      const indexName = row.index_name as string;
      if (!indexMap.has(indexName)) {
        indexMap.set(indexName, { name: indexName, columns: [], unique: row.non_unique === 0 });
      }
      indexMap.get(indexName)!.columns.push(row.column_name as string);
    }

    return {
      schema: schemaName,
      name: table,
      columns: colRows.map((row) => ({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default as string | null,
        comment: (row.column_comment as string) || null,
      })),
      primaryKeys: pkRows.map((row) => row.column_name as string),
      foreignKeys: fkRows.map((row) => ({
        column: row.column_name as string,
        refSchema: row.ref_schema as string,
        refTable: row.ref_table as string,
        refColumn: row.ref_column as string,
      })) as ForeignKeyInfo[],
      indexes: [...indexMap.values()],
    };
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const pool = this.getPool();
    const maxRows = input.maxRows ?? 100;
    const [rows] = await pool.query<mysql.RowDataPacket[]>({
      sql: input.query,
      values: input.params ?? [],
      timeout: this.config.queryTimeoutMs,
    });
    const allRows = rows as unknown[];
    const limitedRows = allRows.slice(0, maxRows);
    return { rows: limitedRows, rowCount: limitedRows.length, truncated: allRows.length > maxRows };
  }

  async explainQuery(input: QueryInput): Promise<ExplainResult> {
    const pool = this.getPool();
    const [rows] = await pool.query<mysql.RowDataPacket[]>({
      sql: `EXPLAIN FORMAT=JSON ${input.query}`,
      values: input.params ?? [],
      timeout: this.config.queryTimeoutMs,
    });
    const plan = rows.map((row) => {
      const value = row.EXPLAIN;
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    });
    return { format: 'rows', plan };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
  }

  private getPool(): mysql.Pool {
    if (!this.pool) {
      const hasConnectionString = Boolean(
        this.config.connectionString || this.config.connectionStringEnv,
      );
      this.pool = hasConnectionString
        ? mysql.createPool(
            readSecret(this.config.connectionString, this.config.connectionStringEnv),
          )
        : mysql.createPool({
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.username,
            password: readSecret(this.config.password, this.config.passwordEnv),
            ssl: this.config.ssl
              ? { rejectUnauthorized: this.config.rejectUnauthorized ?? true }
              : undefined,
            connectionLimit: 4,
          });
    }
    return this.pool;
  }
}
