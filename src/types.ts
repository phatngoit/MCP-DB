export type ConnectionType = 'oracle' | 'mssql' | 'mongodb' | 'postgres' | 'mysql';
export type AccessMode = 'readonly' | 'readwrite';

export interface BaseConnectionConfig {
  type: ConnectionType;
  mode: AccessMode;
  name?: string;
  maxRows?: number;
  queryTimeoutMs?: number;
  allowSchemas?: string[];
  denySchemas?: string[];
  allowTables?: string[];
  denyTables?: string[];
}

export interface OracleConnectionConfig extends BaseConnectionConfig {
  type: 'oracle';
  host?: string;
  port: number;
  serviceName?: string;
  sid?: string;
  connectDescriptor?: string;
  username: string;
  password?: string;
  passwordEnv?: string;
  clientMode?: 'thin' | 'thick';
  clientLibDir?: string;
  clientLibDirEnv?: string;
}

export interface MssqlConnectionConfig extends BaseConnectionConfig {
  type: 'mssql';
  host?: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  passwordEnv?: string;
  connectionString?: string;
  connectionStringEnv?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface MongoConnectionConfig extends BaseConnectionConfig {
  type: 'mongodb';
  uri?: string;
  uriEnv?: string;
  database: string;
}

export interface PostgresConnectionConfig extends BaseConnectionConfig {
  type: 'postgres';
  host?: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  passwordEnv?: string;
  connectionString?: string;
  connectionStringEnv?: string;
  ssl?: boolean;
  rejectUnauthorized?: boolean;
}

export interface MysqlConnectionConfig extends BaseConnectionConfig {
  type: 'mysql';
  host?: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  passwordEnv?: string;
  connectionString?: string;
  connectionStringEnv?: string;
  ssl?: boolean;
  rejectUnauthorized?: boolean;
}

export type DbConnectionConfig =
  | OracleConnectionConfig
  | MssqlConnectionConfig
  | MongoConnectionConfig
  | PostgresConnectionConfig
  | MysqlConnectionConfig;

export interface SecurityConfig {
  defaultMaxRows: number;
  queryTimeoutMs: number;
  blockMultiStatement: boolean;
  allowWriteOperations: boolean;
  maskColumns: string[];
  auditLogPath?: string;
}

export interface AppConfig {
  security: SecurityConfig;
  connections: Record<string, DbConnectionConfig>;
}

export interface TableInfo {
  schema?: string;
  name: string;
  type?: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: string | null;
}

export interface ForeignKeyInfo {
  column: string;
  refSchema?: string;
  refTable: string;
  refColumn: string;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface TableDescription {
  schema?: string;
  name: string;
  columns: ColumnInfo[];
  primaryKeys?: string[];
  foreignKeys?: ForeignKeyInfo[];
  indexes?: IndexInfo[];
}

export interface QueryInput {
  query: string;
  params?: unknown[];
  maxRows?: number;
}

export interface QueryResult {
  rows: unknown[];
  rowCount: number;
  truncated: boolean;
}

export interface ExplainResult {
  format: 'text' | 'rows';
  plan: unknown[];
}

export interface MongoFindInput {
  collection: string;
  filter?: Record<string, unknown>;
  projection?: Record<string, unknown>;
  sort?: Record<string, 1 | -1>;
  maxRows?: number;
}

export interface MongoAggregateInput {
  collection: string;
  pipeline: Record<string, unknown>[];
  maxRows?: number;
}

export interface MongoCountInput {
  collection: string;
  filter?: Record<string, unknown>;
}

export interface MongoIndexInfo {
  name: string;
  key: Record<string, unknown>;
  unique?: boolean;
  sparse?: boolean;
}

export interface DbConnector {
  readonly type: ConnectionType;
  readonly name: string;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  listSchemas(): Promise<string[]>;
  listTables(schema?: string): Promise<TableInfo[]>;
  describeTable(schema: string | undefined, table: string): Promise<TableDescription>;
  query(input: QueryInput): Promise<QueryResult>;
  explainQuery(input: QueryInput): Promise<ExplainResult>;
  close(): Promise<void>;
}

export interface MongoDbConnector extends DbConnector {
  listCollections(): Promise<TableInfo[]>;
  describeCollection(collection: string): Promise<TableDescription>;
  find(input: MongoFindInput): Promise<QueryResult>;
  aggregate(input: MongoAggregateInput): Promise<QueryResult>;
  count(input: MongoCountInput): Promise<number>;
  getIndexes(collection: string): Promise<MongoIndexInfo[]>;
  explainFind(input: MongoFindInput): Promise<unknown>;
  explainAggregate(input: MongoAggregateInput): Promise<unknown>;
}
