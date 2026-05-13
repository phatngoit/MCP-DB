declare module 'oracledb' {
  export interface ExecuteOptions {
    outFormat?: number;
    maxRows?: number;
  }

  export interface ExecuteResult<T = Record<string, unknown>> {
    rows?: T[];
  }

  export interface Connection {
    execute<T = Record<string, unknown>>(
      sql: string,
      bindParams?: unknown,
      options?: ExecuteOptions,
    ): Promise<ExecuteResult<T>>;
    close(): Promise<void>;
  }

  export interface Pool {
    getConnection(): Promise<Connection>;
    close(drainTime?: number): Promise<void>;
  }

  export interface PoolAttributes {
    user: string;
    password: string;
    connectString: string;
    poolMin?: number;
    poolMax?: number;
    queueTimeout?: number;
  }

  const oracledb: {
    OUT_FORMAT_OBJECT: number;
    createPool(attributes: PoolAttributes): Promise<Pool>;
  };

  export default oracledb;
}

declare module 'mssql' {
  export class ConnectionPool {
    constructor(config: unknown);
    connect(): Promise<ConnectionPool>;
    close(): Promise<void>;
    request(): Request;
  }

  export class Transaction {
    constructor(pool: ConnectionPool);
    begin(): Promise<void>;
    rollback(): Promise<void>;
    request(): Request;
  }

  export class Request {
    input(name: string, type: unknown, value: unknown): Request;
    query<T = Record<string, unknown>>(query: string): Promise<QueryResult<T>>;
    batch<T = Record<string, unknown>>(query: string): Promise<QueryResult<T>>;
  }

  export interface QueryResult<T = Record<string, unknown>> {
    recordset?: T[];
    recordsets?: T[][];
  }

  const sql: {
    ConnectionPool: typeof ConnectionPool;
    Transaction: typeof Transaction;
    NVarChar: unknown;
  };

  export default sql;
}
