import oracledb from 'oracledb';
import type { Connection, Pool } from 'oracledb';
import type {
  DbConnector,
  ExplainResult,
  ForeignKeyInfo,
  IndexInfo,
  OracleConnectionConfig,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

let initializedThickClientLibDir: string | undefined;

export class OracleConnector implements DbConnector {
  readonly type = 'oracle' as const;
  readonly name: string;
  private pool?: Pool;

  constructor(private readonly config: OracleConnectionConfig) {
    this.name = config.name ?? 'oracle';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    return this.withOracleErrorContext(async () => {
      const connection = await this.getConnection();
      try {
        await connection.execute('SELECT 1 FROM DUAL');
        return { ok: true, message: `Oracle connection succeeded (${oracleModeLabel()}).` };
      } finally {
        await connection.close();
      }
    });
  }

  async listSchemas(): Promise<string[]> {
    return this.withOracleErrorContext(async () => {
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
    });
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    return this.withOracleErrorContext(async () => {
      const connection = await this.getConnection();
      try {
        const owner = schema?.toUpperCase();
        const result = await connection.execute<{
          OWNER: string;
          TABLE_NAME: string;
          TYPE: string;
        }>(
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
    });
  }

  async describeTable(schema: string | undefined, table: string): Promise<TableDescription> {
    return this.withOracleErrorContext(async () => {
      const connection = await this.getConnection();
      try {
        const owner = schema?.toUpperCase() ?? this.config.username.toUpperCase();
        const tableName = table.toUpperCase();

        const [colResult, pkResult, fkResult, idxResult] = await Promise.all([
          connection.execute<{
            COLUMN_NAME: string;
            DATA_TYPE: string;
            NULLABLE: string;
            DATA_DEFAULT: string | null;
          }>(
            `SELECT column_name, data_type, nullable, data_default
             FROM all_tab_columns
            WHERE owner = :owner AND table_name = :tableName
            ORDER BY column_id`,
            { owner, tableName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          ),

          connection.execute<{ COLUMN_NAME: string }>(
            `SELECT acc.column_name
             FROM all_constraints ac
             JOIN all_cons_columns acc
               ON ac.constraint_name = acc.constraint_name AND ac.owner = acc.owner
            WHERE ac.constraint_type = 'P'
              AND ac.owner = :owner AND ac.table_name = :tableName
            ORDER BY acc.position`,
            { owner, tableName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          ),

          connection.execute<{
            COLUMN_NAME: string;
            REF_SCHEMA: string;
            REF_TABLE: string;
            REF_COLUMN: string;
          }>(
            `SELECT acc.column_name,
                    rc.owner AS ref_schema,
                    rc.table_name AS ref_table,
                    rcc.column_name AS ref_column
             FROM all_constraints ac
             JOIN all_cons_columns acc
               ON ac.constraint_name = acc.constraint_name AND ac.owner = acc.owner
             JOIN all_constraints rc
               ON ac.r_constraint_name = rc.constraint_name AND ac.r_owner = rc.owner
             JOIN all_cons_columns rcc
               ON rc.constraint_name = rcc.constraint_name AND rc.owner = rcc.owner
              AND acc.position = rcc.position
            WHERE ac.constraint_type = 'R'
              AND ac.owner = :owner AND ac.table_name = :tableName
            ORDER BY acc.position`,
            { owner, tableName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          ),

          connection.execute<{
            INDEX_NAME: string;
            COLUMN_NAME: string;
            UNIQUENESS: string;
            COLUMN_POSITION: number;
          }>(
            `SELECT ai.index_name,
                    aic.column_name,
                    ai.uniqueness,
                    aic.column_position
             FROM all_indexes ai
             JOIN all_ind_columns aic
               ON ai.index_name = aic.index_name AND ai.owner = aic.index_owner
            WHERE ai.owner = :owner AND ai.table_name = :tableName
            ORDER BY ai.index_name, aic.column_position`,
            { owner, tableName },
            { outFormat: oracledb.OUT_FORMAT_OBJECT },
          ),
        ]);

        const indexMap = new Map<string, IndexInfo>();
        for (const row of idxResult.rows ?? []) {
          if (!indexMap.has(row.INDEX_NAME)) {
            indexMap.set(row.INDEX_NAME, {
              name: row.INDEX_NAME,
              columns: [],
              unique: row.UNIQUENESS === 'UNIQUE',
            });
          }
          indexMap.get(row.INDEX_NAME)!.columns.push(row.COLUMN_NAME);
        }

        return {
          schema: owner,
          name: table,
          columns: (colResult.rows ?? []).map((row) => ({
            name: row.COLUMN_NAME,
            type: row.DATA_TYPE,
            nullable: row.NULLABLE === 'Y',
            defaultValue: row.DATA_DEFAULT,
          })),
          primaryKeys: (pkResult.rows ?? []).map((r) => r.COLUMN_NAME),
          foreignKeys: (fkResult.rows ?? []).map((r) => ({
            column: r.COLUMN_NAME,
            refSchema: r.REF_SCHEMA,
            refTable: r.REF_TABLE,
            refColumn: r.REF_COLUMN,
          })) as ForeignKeyInfo[],
          indexes: [...indexMap.values()],
        };
      } finally {
        await connection.close();
      }
    });
  }

  async query(input: QueryInput): Promise<QueryResult> {
    return this.withOracleErrorContext(async () => {
      const connection = await this.getConnection();
      try {
        const maxRows = input.maxRows ?? 100;
        try {
          const result = await connection.execute(input.query, input.params ?? [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            maxRows,
            fetchTypeMap: lobFetchTypeMap(),
          });
          const rows = (result.rows ?? []) as unknown[];
          return { rows, rowCount: rows.length, truncated: rows.length >= maxRows };
        } catch (firstError) {
          if (!isNcharError(firstError)) throw firstError;
          const fallback = await this.retryQueryWithNcharCast(connection, input, maxRows);
          if (!fallback) throw firstError;
          return fallback;
        }
      } finally {
        await connection.close();
      }
    });
  }

  private async retryQueryWithNcharCast(
    connection: Connection,
    input: QueryInput,
    maxRows: number,
  ): Promise<QueryResult | null> {
    if (!/^\s*SELECT\b/i.test(input.query)) return null;
    if (/\bFROM\s*\(/i.test(input.query)) return null;

    const fromMatch = input.query.match(/\bFROM\s+(?:"?([\w$#]+)"?\.)?"?([\w$#]+)"?/i);
    if (!fromMatch) return null;

    const schema = (fromMatch[1] ?? this.config.username).toUpperCase();
    const tableName = fromMatch[2].toUpperCase();

    const colResult = await connection.execute<{ COLUMN_NAME: string; DATA_TYPE: string }>(
      `SELECT column_name, data_type
       FROM all_tab_columns
       WHERE owner = :owner AND table_name = :tableName
       ORDER BY column_id`,
      { owner: schema, tableName },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );

    if (!colResult.rows?.length) return null;

    const ncharTypes = new Set(['NCHAR', 'NVARCHAR2']);
    const ncharCols = new Set(
      colResult.rows.filter((r) => ncharTypes.has(r.DATA_TYPE)).map((r) => r.COLUMN_NAME),
    );
    if (!ncharCols.size) return null;

    const rewritten = /SELECT\s+\*/i.test(input.query)
      ? expandSelectStar(input.query, colResult.rows, ncharCols)
      : castNcharInSelectClause(input.query, ncharCols);

    if (!rewritten) return null;

    const result = await connection.execute(rewritten, input.params ?? [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      maxRows,
      fetchTypeMap: lobFetchTypeMap(),
    });

    const rows = (result.rows ?? []) as unknown[];
    return { rows, rowCount: rows.length, truncated: rows.length >= maxRows };
  }

  async explainQuery(input: QueryInput): Promise<ExplainResult> {
    return this.withOracleErrorContext(async () => {
      const connection = await this.getConnection();
      const statementId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      try {
        await connection.execute(
          `EXPLAIN PLAN SET STATEMENT_ID = '${statementId}' FOR ${input.query}`,
        );
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
    });
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close(10);
      this.pool = undefined;
    }
  }

  private async getConnection(): Promise<Connection> {
    if (!this.pool) {
      initializeOracleClient(this.config);
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
    if (this.config.connectDescriptor) {
      return this.config.connectDescriptor;
    }
    if (this.config.host && this.config.serviceName) {
      return `${this.config.host}:${this.config.port}/${this.config.serviceName}`;
    }
    if (this.config.host && this.config.sid) {
      return `${this.config.host}:${this.config.port}:${this.config.sid}`;
    }
    throw new Error('Oracle connection requires either connectDescriptor, or host with serviceName/sid.');
  }

  private async withOracleErrorContext<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw withOracleErrorContext(error);
    }
  }
}

function initializeOracleClient(config: OracleConnectionConfig): void {
  const clientMode = process.env.ORACLE_CLIENT_MODE ?? config.clientMode ?? 'thin';
  if (clientMode !== 'thick') {
    return;
  }

  const libDir = resolveClientLibDir(config);
  if (initializedThickClientLibDir !== undefined) {
    if (initializedThickClientLibDir !== libDir) {
      throw new Error(
        `Oracle Thick mode was already initialized with ${initializedThickClientLibDir || 'system library path'}, but ${config.name ?? 'oracle'} requested ${libDir || 'system library path'}. Use one Oracle Client libDir for the process.`,
      );
    }
    return;
  }

  try {
    oracledb.initOracleClient(libDir ? { libDir } : undefined);
    initializedThickClientLibDir = libDir;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Oracle Thick mode is required but Oracle Client libraries could not be loaded. ${message}`,
    );
  }
}

function resolveClientLibDir(config: OracleConnectionConfig): string | undefined {
  if (config.clientLibDir) {
    return config.clientLibDir;
  }

  if (config.clientLibDirEnv) {
    const value = process.env[config.clientLibDirEnv];
    if (!value) {
      throw new Error(`Environment variable ${config.clientLibDirEnv} is not set.`);
    }
    return value;
  }

  return undefined;
}

function oracleModeLabel(): string {
  return oracledb.thin ? 'Thin mode' : 'Thick mode';
}

function expandSelectStar(
  query: string,
  cols: Array<{ COLUMN_NAME: string; DATA_TYPE: string }>,
  ncharCols: Set<string>,
): string {
  const colList = cols
    .map((row) => {
      const col = `"${row.COLUMN_NAME}"`;
      return ncharCols.has(row.COLUMN_NAME) ? `TO_CHAR(${col}) ${col}` : col;
    })
    .join(', ');
  return query.replace(/SELECT\s+\*/i, `SELECT ${colList}`);
}

function castNcharInSelectClause(query: string, ncharCols: Set<string>): string | null {
  const selectMatch = query.match(/^\s*SELECT\s+/i);
  if (!selectMatch) return null;
  const selectEnd = selectMatch[0].length;

  // Find FROM at bracket depth 0
  let depth = 0;
  let fromIdx = -1;
  for (let i = selectEnd; i <= query.length - 4; i++) {
    if (query[i] === '(') { depth++; continue; }
    if (query[i] === ')') { depth--; continue; }
    if (depth === 0 && /^FROM\b/i.test(query.slice(i))) { fromIdx = i; break; }
  }
  if (fromIdx === -1) return null;

  const colsPart = query.slice(selectEnd, fromIdx);
  const cols = splitDepth0(colsPart);

  const rewritten = cols.map((col) => {
    const t = col.trim();
    // Skip expressions containing function calls or operators other than dot
    if (t.includes('(') || t.includes('||') || t.includes('|')) return col;
    // Match: [qualifier.]colname [AS alias | alias]
    const m = t.match(/^([\w$#"]+\.)?"?([\w$#]+)"?(\s+(?:AS\s+)?"?[\w$#]+"?)?$/i);
    if (!m) return col;
    const colName = m[2].toUpperCase();
    if (!ncharCols.has(colName)) return col;
    const qualifier = m[1] ?? '';
    const alias = m[3] ?? ` "${colName}"`;
    return `TO_CHAR(${qualifier}"${colName}")${alias}`;
  });

  return query.slice(0, selectEnd) + rewritten.join(',') + query.slice(fromIdx);
}

function splitDepth0(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(s.slice(start));
  return parts;
}

function lobFetchTypeMap() {
  return new Map([
    [oracledb.DB_TYPE_CLOB, { type: oracledb.DB_TYPE_VARCHAR }],
    [oracledb.DB_TYPE_NCLOB, { type: oracledb.DB_TYPE_VARCHAR }],
  ]);
}

function isNcharError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('NLS_NCHAR_CHARACTERSET') || message.includes('character set id');
}

function withOracleErrorContext(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (isNcharError(error)) {
    return new Error(
      `${message}\n\nThis Oracle database uses an NCHAR character set (e.g. AL16UTF16) that node-oracledb Thin mode cannot handle. ` +
        `For SELECT * on a single table the connector attempts an automatic NCHAR→VARCHAR2 cast; complex queries require Thick mode. ` +
        `Configure this Oracle connection with clientMode: thick and set clientLibDir to the Oracle Instant Client directory path.`,
    );
  }

  return error instanceof Error ? error : new Error(message);
}
