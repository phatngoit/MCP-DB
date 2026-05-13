import oracledb from 'oracledb';
import type { Connection, Pool } from 'oracledb';
import type {
  DbConnector,
  ExplainResult,
  OracleConnectionConfig,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

export class OracleConnector implements DbConnector {
  readonly type = 'oracle' as const;
  readonly name: string;
  private pool?: Pool;

  constructor(private readonly config: OracleConnectionConfig) {
    this.name = config.name ?? 'oracle';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const connection = await this.getConnection();
    try {
      await connection.execute('SELECT 1 FROM DUAL');
      return { ok: true, message: 'Oracle connection succeeded.' };
    } finally {
      await connection.close();
    }
  }

  async listSchemas(): Promise<string[]> {
    const connection = await this.getConnection();
    try {
      const result = await connection.execute<{ USERNAME: string }>(
        `SELECT username FROM all_users ORDER BY username`,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return (result.rows ?? []).map((row) => row.USERNAME);
    } finally {
      await connection.close();
    }
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const connection = await this.getConnection();
    try {
      const owner = schema?.toUpperCase();
      const result = await connection.execute<{ OWNER: string; TABLE_NAME: string; TYPE: string }>(
        `SELECT owner, table_name, 'TABLE' AS type
           FROM all_tables
          WHERE (:owner IS NULL OR owner = :owner)
          ORDER BY owner, table_name`,
        { owner },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return (result.rows ?? []).map((row) => ({
        schema: row.OWNER,
        name: row.TABLE_NAME,
        type: row.TYPE,
      }));
    } finally {
      await connection.close();
    }
  }

  async describeTable(schema: string | undefined, table: string): Promise<TableDescription> {
    const connection = await this.getConnection();
    try {
      const owner = schema?.toUpperCase() ?? this.config.username.toUpperCase();
      const result = await connection.execute<{
        COLUMN_NAME: string;
        DATA_TYPE: string;
        NULLABLE: string;
        DATA_DEFAULT: string | null;
      }>(
        `SELECT column_name, data_type, nullable, data_default
           FROM all_tab_columns
          WHERE owner = :owner AND table_name = :tableName
          ORDER BY column_id`,
        { owner, tableName: table.toUpperCase() },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return {
        schema: owner,
        name: table,
        columns: (result.rows ?? []).map((row) => ({
          name: row.COLUMN_NAME,
          type: row.DATA_TYPE,
          nullable: row.NULLABLE === 'Y',
          defaultValue: row.DATA_DEFAULT,
        })),
      };
    } finally {
      await connection.close();
    }
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const connection = await this.getConnection();
    try {
      const maxRows = input.maxRows ?? 100;
      const result = await connection.execute(
        input.query,
        input.params ?? [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows },
      );
      const rows = (result.rows ?? []) as unknown[];
      return { rows, rowCount: rows.length, truncated: rows.length >= maxRows };
    } finally {
      await connection.close();
    }
  }

  async explainQuery(input: QueryInput): Promise<ExplainResult> {
    const connection = await this.getConnection();
    const statementId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      await connection.execute(`EXPLAIN PLAN SET STATEMENT_ID = '${statementId}' FOR ${input.query}`);
      const result = await connection.execute<{ PLAN_TABLE_OUTPUT: string }>(
        `SELECT plan_table_output
           FROM TABLE(DBMS_XPLAN.DISPLAY(NULL, :statementId, 'BASIC +PREDICATE'))`,
        { statementId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      return {
        format: 'text',
        plan: (result.rows ?? []).map((row) => row.PLAN_TABLE_OUTPUT),
      };
    } finally {
      await connection.close();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close(10);
      this.pool = undefined;
    }
  }

  private async getConnection(): Promise<Connection> {
    if (!this.pool) {
      this.pool = await oracledb.createPool({
        user: this.config.username,
        password: readSecret(this.config.password, this.config.passwordEnv),
        connectString: this.connectString(),
        poolMin: 0,
        poolMax: 4,
        queueTimeout: this.config.queryTimeoutMs,
      });
    }
    return this.pool.getConnection();
  }

  private connectString(): string {
    if (this.config.serviceName) {
      return `${this.config.host}:${this.config.port}/${this.config.serviceName}`;
    }
    if (this.config.sid) {
      return `${this.config.host}:${this.config.port}:${this.config.sid}`;
    }
    throw new Error('Oracle connection requires either serviceName or sid.');
  }
}
