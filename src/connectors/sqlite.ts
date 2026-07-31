import Database from 'better-sqlite3';
import type {
  ColumnInfo,
  DbConnector,
  ExplainResult,
  ForeignKeyInfo,
  IndexInfo,
  QueryInput,
  QueryResult,
  SqliteConnectionConfig,
  TableDescription,
  TableInfo,
} from '../types.js';

interface TableInfoRow {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface ForeignKeyListRow {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string | null;
}

interface IndexListRow {
  seq: number;
  name: string;
  unique: number;
  origin: string;
  partial: number;
}

interface IndexInfoRow {
  seqno: number;
  cid: number;
  name: string;
}

interface DatabaseListRow {
  seq: number;
  name: string;
  file: string;
}

export class SqliteConnector implements DbConnector {
  readonly type = 'sqlite' as const;
  readonly name: string;
  private db?: Database.Database;

  constructor(private readonly config: SqliteConnectionConfig) {
    this.name = config.name ?? 'sqlite';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const db = this.getDb();
    db.prepare('SELECT 1').get();
    return { ok: true, message: 'SQLite connection succeeded.' };
  }

  async listSchemas(): Promise<string[]> {
    const db = this.getDb();
    const rows = db.pragma('database_list') as DatabaseListRow[];
    return rows.map((row) => row.name);
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const db = this.getDb();
    const schemaName = schema ?? 'main';
    const rows = db
      .prepare(
        `SELECT name, type
           FROM ${quoteIdentifier(schemaName)}.sqlite_schema
          WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
      )
      .all() as Array<{ name: string; type: string }>;
    return rows.map((row) => ({
      schema: schemaName,
      name: row.name,
      type: row.type.toUpperCase(),
    }));
  }

  async describeTable(schema: string | undefined, table: string): Promise<TableDescription> {
    const db = this.getDb();
    const schemaName = schema ?? 'main';
    const qSchema = quoteIdentifier(schemaName);
    const qTable = quoteIdentifier(table);

    const columns = db.pragma(`${qSchema}.table_info(${qTable})`) as TableInfoRow[];
    const foreignKeys = db.pragma(`${qSchema}.foreign_key_list(${qTable})`) as ForeignKeyListRow[];
    const indexList = db.pragma(`${qSchema}.index_list(${qTable})`) as IndexListRow[];

    const indexes: IndexInfo[] = indexList.map((idx) => {
      const indexInfo = db.pragma(
        `${qSchema}.index_info(${quoteIdentifier(idx.name)})`,
      ) as IndexInfoRow[];
      return {
        name: idx.name,
        columns: indexInfo.map((col) => col.name),
        unique: idx.unique === 1,
      };
    });

    const columnInfos: ColumnInfo[] = columns.map((col) => ({
      name: col.name,
      type: col.type,
      nullable: col.notnull === 0,
      defaultValue: col.dflt_value,
    }));

    return {
      schema: schemaName,
      name: table,
      columns: columnInfos,
      primaryKeys: columns
        .filter((col) => col.pk > 0)
        .sort((a, b) => a.pk - b.pk)
        .map((col) => col.name),
      foreignKeys: foreignKeys.map((fk) => ({
        column: fk.from,
        refTable: fk.table,
        refColumn: fk.to ?? '',
      })) as ForeignKeyInfo[],
      indexes,
    };
  }

  async query(input: QueryInput): Promise<QueryResult> {
    const db = this.getDb();
    const maxRows = input.maxRows ?? 100;
    const allRows = db.prepare(input.query).all(...(input.params ?? [])) as unknown[];
    const rows = allRows.slice(0, maxRows);
    return { rows, rowCount: rows.length, truncated: allRows.length > maxRows };
  }

  async explainQuery(input: QueryInput): Promise<ExplainResult> {
    const db = this.getDb();
    const plan = db
      .prepare(`EXPLAIN QUERY PLAN ${input.query}`)
      .all(...(input.params ?? [])) as unknown[];
    return { format: 'rows', plan };
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = undefined;
    }
  }

  private getDb(): Database.Database {
    if (!this.db) {
      this.db = new Database(this.config.file, {
        readonly: this.config.mode === 'readonly',
        ...(this.config.queryTimeoutMs !== undefined ? { timeout: this.config.queryTimeoutMs } : {}),
      });
    }
    return this.db;
  }
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
