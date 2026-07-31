import pg from 'pg';
import type {
  DbConnector,
  ExplainResult,
  ForeignKeyInfo,
  IndexInfo,
  PostgresConnectionConfig,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

const { Pool } = pg;

export class PostgresConnector implements DbConnector {
  readonly type = 'postgres' as const;
  readonly name: string;
  private pool?: pg.Pool;

  constructor(private readonly config: PostgresConnectionConfig) {
    this.name = config.name ?? 'postgres';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const pool = this.getPool();
    await pool.query('SELECT 1');
    return { ok: true, message: 'PostgreSQL connection succeeded.' };
  }

  async listSchemas(): Promise<string[]> {
    const pool = this.getPool();
    const result = await pool.query<{ schema_name: string }>(
      `SELECT schema_name
         FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
          AND schema_name NOT LIKE 'pg_toast%'
          AND schema_name NOT LIKE 'pg_temp%'
        ORDER BY schema_name`,
    );
    return result.rows.map((row) => row.schema_name);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const pool = this.getPool();
    const result = await pool.query<{
      table_schema: string;
      table_name: string;
      table_type: string;
    }>(
      `SELECT table_schema, table_name, table_type
         FROM information_schema.tables
        WHERE ($1::text IS NULL OR table_schema = $1)
          AND table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY table_schema, table_name`,
      [schema ?? null],
    );
    return result.rows.map((row) => ({
      schema: row.table_schema,
      name: row.table_name,
      type: row.table_type,
    }));
  }

  async describeTable(schema: string | undefined, table: string): Promise<TableDescription> {
    const pool = this.getPool();
    const schemaName = schema ?? 'public';

    const [colResult, pkResult, fkResult, idxResult] = await Promise.all([
      pool.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        column_comment: string | null;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default,
                col_description((quote_ident(table_schema) || '.' || quote_ident(table_name))::regclass, ordinal_position) AS column_comment
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [schemaName, table],
      ),

      pool.query<{ column_name: string }>(
        `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          WHERE tc.constraint_type = 'PRIMARY KEY'
            AND tc.table_schema = $1 AND tc.table_name = $2
          ORDER BY kcu.ordinal_position`,
        [schemaName, table],
      ),

      pool.query<{
        column_name: string;
        ref_schema: string;
        ref_table: string;
        ref_column: string;
      }>(
        `SELECT kcu.column_name,
                ccu.table_schema AS ref_schema,
                ccu.table_name AS ref_table,
                ccu.column_name AS ref_column
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
           JOIN information_schema.constraint_column_usage ccu
             ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = $1 AND tc.table_name = $2`,
        [schemaName, table],
      ),

      pool.query<{
        index_name: string;
        column_name: string;
        is_unique: boolean;
        ordinal: number;
      }>(
        `SELECT ic.relname AS index_name,
                a.attname AS column_name,
                ix.indisunique AS is_unique,
                array_position(ix.indkey, a.attnum) AS ordinal
           FROM pg_index ix
           JOIN pg_class ic ON ic.oid = ix.indexrelid
           JOIN pg_class tc ON tc.oid = ix.indrelid
           JOIN pg_namespace n ON n.oid = tc.relnamespace
           JOIN pg_attribute a ON a.attrelid = tc.oid AND a.attnum = ANY(ix.indkey)
          WHERE n.nspname = $1 AND tc.relname = $2
          ORDER BY ic.relname, ordinal`,
        [schemaName, table],
      ),
    ]);

    const indexMap = new Map<string, IndexInfo>();
    for (const row of idxResult.rows) {
      if (!indexMap.has(row.index_name)) {
        indexMap.set(row.index_name, { name: row.index_name, columns: [], unique: row.is_unique });
      }
      indexMap.get(row.index_name)!.columns.push(row.column_name);
    }

    return {
      schema: schemaName,
      name: table,
      columns: colResult.rows.map((row) => ({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        defaultValue: row.column_default,
        comment: row.column_comment,
      })),
      primaryKeys: pkResult.rows.map((row) => row.column_name),
      foreignKeys: fkResult.rows.map((row) => ({
        column: row.column_name,
        refSchema: row.ref_schema,
        refTable: row.ref_table,
        refColumn: row.ref_column,
      })) as ForeignKeyInfo[],
      indexes: [...indexMap.values()],
    };
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const pool = this.getPool();
    const maxRows = input.maxRows ?? 100;
    const result = await pool.query(input.query, input.params ?? []);
    const allRows = (result.rows ?? []) as unknown[];
    const rows = allRows.slice(0, maxRows);
    return { rows, rowCount: rows.length, truncated: allRows.length > maxRows };
  }

  async explainQuery(input: QueryInput): Promise<ExplainResult> {
    const pool = this.getPool();
    const result = await pool.query<{ 'QUERY PLAN': unknown }>(
      `EXPLAIN (FORMAT JSON) ${input.query}`,
      input.params ?? [],
    );
    const plan = result.rows[0]?.['QUERY PLAN'];
    return { format: 'rows', plan: Array.isArray(plan) ? plan : [plan] };
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
  }

  private getPool(): pg.Pool {
    if (!this.pool) {
      const hasConnectionString = Boolean(
        this.config.connectionString || this.config.connectionStringEnv,
      );
      this.pool = hasConnectionString
        ? new Pool({
            connectionString: readSecret(this.config.connectionString, this.config.connectionStringEnv),
            statement_timeout: this.config.queryTimeoutMs,
            max: 4,
          })
        : new Pool({
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.username,
            password: readSecret(this.config.password, this.config.passwordEnv),
            ssl: this.config.ssl
              ? { rejectUnauthorized: this.config.rejectUnauthorized ?? true }
              : undefined,
            statement_timeout: this.config.queryTimeoutMs,
            max: 4,
          });
    }
    return this.pool;
  }
}
