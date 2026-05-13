import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppConfig, MongoDbConnector } from '../types.js';
import type { ConnectorRegistry } from '../core/registry.js';
import {
  assertAllowedObject,
  maskResult,
  resolveLimit,
  validateMongoPipeline,
  validateSqlQuery,
} from '../core/security.js';
import { audit } from '../core/audit.js';
import { formatQueryResult } from '../core/format.js';

type ToolResponse = Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>;

export function registerDbTools(server: McpServer, registry: ConnectorRegistry, config: AppConfig): void {
  server.tool('db_list_connections', 'List configured database connections.', {}, async () =>
    ok(registry.list()),
  );

  server.tool(
    'db_test_connection',
    'Test one configured database connection.',
    { connection: z.string().describe('Connection name from db_list_connections.') },
    async ({ connection }) =>
      runAudited(config, connection, 'db_test_connection', 'test', async () =>
        registry.get(connection).testConnection(),
      ),
  );

  server.tool(
    'db_list_schemas',
    'List schemas or databases for a connection.',
    { connection: z.string() },
    async ({ connection }) =>
      runAudited(config, connection, 'db_list_schemas', 'list_schemas', async () =>
        registry.get(connection).listSchemas(),
      ),
  );

  server.tool(
    'db_list_tables',
    'List SQL tables or MongoDB collections.',
    {
      connection: z.string(),
      schema: z.string().optional().describe('Optional schema/database name.'),
    },
    async ({ connection, schema }) =>
      runAudited(config, connection, 'db_list_tables', 'list_tables', async () => {
        const connectionConfig = registry.getConfig(connection);
        if (schema) {
          assertAllowedObject(schema, 'schema', connectionConfig);
        }
        return registry.get(connection).listTables(schema);
      }),
  );

  server.tool(
    'db_describe_table',
    'Describe SQL table columns or sample MongoDB collection fields.',
    {
      connection: z.string(),
      table: z.string(),
      schema: z.string().optional(),
    },
    async ({ connection, table, schema }) =>
      runAudited(config, connection, 'db_describe_table', 'describe_table', async () => {
        const connectionConfig = registry.getConfig(connection);
        if (schema) {
          assertAllowedObject(schema, 'schema', connectionConfig);
        }
        assertAllowedObject(table, 'table', connectionConfig);
        return registry.get(connection).describeTable(schema, table);
      }),
  );

  server.tool(
    'db_query',
    'Run a readonly SQL query against Oracle or Microsoft SQL Server.',
    {
      connection: z.string(),
      query: z.string(),
      params: z.array(z.unknown()).optional(),
      maxRows: z.number().int().positive().optional(),
    },
    async ({ connection, query, params, maxRows }) =>
      runAudited(config, connection, 'db_query', 'query', async () => {
        const connectionConfig = registry.getConfig(connection);
        const connector = registry.get(connection);
        if (connector.type === 'mongodb') {
          throw new Error('Use db_mongo_find or db_mongo_aggregate for MongoDB.');
        }

        validateSqlQuery(query, config.security, connectionConfig);
        const limit = resolveLimit(config.security, connectionConfig, maxRows);
        const result = await connector.query({ query, params, maxRows: limit });
        return formatQueryResult(maskResult(result, config.security));
      }),
  );

  server.tool(
    'db_explain_query',
    'Return an execution plan for a readonly SQL query without returning result rows.',
    {
      connection: z.string(),
      query: z.string(),
      params: z.array(z.unknown()).optional(),
    },
    async ({ connection, query, params }) =>
      runAudited(config, connection, 'db_explain_query', 'explain_query', async () => {
        const connectionConfig = registry.getConfig(connection);
        const connector = registry.get(connection);
        if (connector.type === 'mongodb') {
          throw new Error('db_explain_query supports Oracle and Microsoft SQL Server only.');
        }

        validateSqlQuery(query, config.security, connectionConfig);
        return connector.explainQuery({ query, params });
      }),
  );

  server.tool(
    'db_mongo_find',
    'Run a readonly MongoDB find operation.',
    {
      connection: z.string(),
      collection: z.string(),
      filter: z.record(z.unknown()).optional(),
      projection: z.record(z.unknown()).optional(),
      sort: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
      maxRows: z.number().int().positive().optional(),
    },
    async ({ connection, collection, filter, projection, sort, maxRows }) =>
      runAudited(config, connection, 'db_mongo_find', 'find', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_find requires a MongoDB connection.');
        }
        const limit = resolveLimit(config.security, connectionConfig, maxRows);
        const result = await (connector as MongoDbConnector).find({
          collection,
          filter,
          projection,
          sort,
          maxRows: limit,
        });
        return formatQueryResult(maskResult(result, config.security));
      }),
  );

  server.tool(
    'db_mongo_aggregate',
    'Run a readonly MongoDB aggregate pipeline. $out and $merge are blocked in readonly mode.',
    {
      connection: z.string(),
      collection: z.string(),
      pipeline: z.array(z.record(z.unknown())),
      maxRows: z.number().int().positive().optional(),
    },
    async ({ connection, collection, pipeline, maxRows }) =>
      runAudited(config, connection, 'db_mongo_aggregate', 'aggregate', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        validateMongoPipeline(pipeline, config.security, connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_aggregate requires a MongoDB connection.');
        }
        const limit = resolveLimit(config.security, connectionConfig, maxRows);
        const result = await (connector as MongoDbConnector).aggregate({
          collection,
          pipeline,
          maxRows: limit,
        });
        return formatQueryResult(maskResult(result, config.security));
      }),
  );
}

async function runAudited<T>(
  config: AppConfig,
  connection: string,
  tool: string,
  operation: string,
  action: () => Promise<T>,
): ToolResponse {
  try {
    const result = await action();
    await audit(config.security, { connection, tool, operation, success: true });
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await audit(config.security, { connection, tool, operation, success: false, error: message });
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
      isError: true,
    };
  }
}

function ok(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
  };
}
