import type { AppConfig, DbConnector, DbConnectionConfig } from '../types.js';
import { MssqlConnector } from '../connectors/mssql.js';
import { MongodbConnector } from '../connectors/mongodb.js';
import { MysqlConnector } from '../connectors/mysql.js';
import { OracleConnector } from '../connectors/oracle.js';
import { PostgresConnector } from '../connectors/postgres.js';
import { UserInputError } from './errors.js';

export class ConnectorRegistry {
  private readonly connectors = new Map<string, DbConnector>();

  constructor(private readonly config: AppConfig) {
    for (const [name, connection] of Object.entries(config.connections)) {
      this.connectors.set(name, createConnector({ ...connection, name } as DbConnectionConfig));
    }
  }

  list(): Array<{ name: string; type: string; mode: string }> {
    return Object.entries(this.config.connections).map(([name, connection]) => ({
      name,
      type: connection.type,
      mode: connection.mode,
    }));
  }

  get(name: string): DbConnector {
    const connector = this.connectors.get(name);
    if (!connector) {
      throw new UserInputError(`Unknown connection '${name}'.`);
    }
    return connector;
  }

  getConfig(name: string): DbConnectionConfig {
    const connection = this.config.connections[name];
    if (!connection) {
      throw new UserInputError(`Unknown connection '${name}'.`);
    }
    return connection;
  }

  async close(): Promise<void> {
    await Promise.all([...this.connectors.values()].map((connector) => connector.close()));
  }
}

function createConnector(config: DbConnectionConfig): DbConnector {
  switch (config.type) {
    case 'oracle':
      return new OracleConnector(config);
    case 'mssql':
      return new MssqlConnector(config);
    case 'mongodb':
      return new MongodbConnector(config);
    case 'postgres':
      return new PostgresConnector(config);
    case 'mysql':
      return new MysqlConnector(config);
  }
}
