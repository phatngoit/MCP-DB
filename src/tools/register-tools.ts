import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { AppConfig, MongoDbConnector, QdrantDbConnector } from '../types.js';
import type { ConnectorRegistry } from '../core/registry.js';
import {
  assertAllowedObject,
  assertNonEmptyFilter,
  assertWriteAllowed,
  maskResult,
  resolveLimit,
  validateMongoPipeline,
  validateSqlQuery,
} from '../core/security.js';
import { audit } from '../core/audit.js';
import { formatQueryResult, formatSchemaList, formatTableList, formatTableDescription } from '../core/format.js';

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
      runAudited(config, connection, 'db_list_schemas', 'list_schemas', async () => {
        const schemas = await registry.get(connection).listSchemas();
        return formatSchemaList(schemas);
      }),
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
        const tables = await registry.get(connection).listTables(schema);
        return formatTableList(tables);
      }),
  );

  server.tool(
    'db_describe_table',
    'Describe SQL table columns or sample MongoDB collection fields.',
    {
      connection: z.string(),
      table: z.string(),
      schema: z.string().optional(),
      sampleSize: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'MongoDB only: number of sample documents used to infer column types (default: connection describeSampleSize, 20 unless configured).',
        ),
    },
    async ({ connection, table, schema, sampleSize }) =>
      runAudited(config, connection, 'db_describe_table', 'describe_table', async () => {
        const connectionConfig = registry.getConfig(connection);
        if (schema) {
          assertAllowedObject(schema, 'schema', connectionConfig);
        }
        assertAllowedObject(table, 'table', connectionConfig);
        const desc = await registry.get(connection).describeTable(schema, table, sampleSize);
        return formatTableDescription(desc);
      }),
  );

  server.tool(
    'db_query',
    'Run a readonly SQL query against Oracle, Microsoft SQL Server, PostgreSQL, MySQL/MariaDB, or SQLite.',
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
        if (connector.type === 'qdrant') {
          throw new Error('Use db_qdrant_search or db_qdrant_scroll for Qdrant.');
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
        if (connector.type === 'mongodb' || connector.type === 'qdrant') {
          throw new Error('db_explain_query supports Oracle, Microsoft SQL Server, PostgreSQL, MySQL/MariaDB, and SQLite only.');
        }

        validateSqlQuery(query, config.security, connectionConfig);
        return connector.explainQuery({ query, params });
      }),
  );

  server.tool(
    'db_count',
    'Count rows in a SQL table (Oracle, MSSQL, PostgreSQL, MySQL/MariaDB, or SQLite). For MongoDB use db_mongo_count.',
    {
      connection: z.string(),
      table: z.string().describe('Table name.'),
      schema: z.string().optional().describe('Optional schema name.'),
      where: z.string().optional().describe('Optional SQL WHERE clause without the WHERE keyword.'),
    },
    async ({ connection, table, schema, where }) =>
      runAudited(config, connection, 'db_count', 'count', async () => {
        const connectionConfig = registry.getConfig(connection);
        const connector = registry.get(connection);
        if (connector.type === 'mongodb') {
          throw new Error('Use db_mongo_count for MongoDB connections.');
        }
        if (connector.type === 'qdrant') {
          throw new Error('Use db_qdrant_count for Qdrant connections.');
        }
        if (schema) {
          assertAllowedObject(schema, 'schema', connectionConfig);
        }
        assertAllowedObject(table, 'table', connectionConfig);
        const query = buildSqlCountQuery(connector.type, schema, table, where);
        validateSqlQuery(query, config.security, connectionConfig);
        const result = await connector.query({ query, maxRows: 1 });
        return formatQueryResult(result);
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
      skip: z.number().int().nonnegative().optional().describe('Number of matching documents to skip, for pagination.'),
      maxRows: z.number().int().positive().optional(),
    },
    async ({ connection, collection, filter, projection, sort, skip, maxRows }) =>
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
          skip,
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

  server.tool(
    'db_mongo_count',
    'Count documents in a MongoDB collection.',
    {
      connection: z.string(),
      collection: z.string(),
      filter: z.record(z.unknown()).optional().describe('Optional MongoDB filter object.'),
    },
    async ({ connection, collection, filter }) =>
      runAudited(config, connection, 'db_mongo_count', 'count', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_count requires a MongoDB connection.');
        }
        const total = await (connector as MongoDbConnector).count({ collection, filter });
        return `Count: ${total}`;
      }),
  );

  server.tool(
    'db_mongo_get_indexes',
    'List indexes for a MongoDB collection.',
    {
      connection: z.string(),
      collection: z.string(),
    },
    async ({ connection, collection }) =>
      runAudited(config, connection, 'db_mongo_get_indexes', 'get_indexes', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_get_indexes requires a MongoDB connection.');
        }
        const indexes = await (connector as MongoDbConnector).getIndexes(collection);
        return formatQueryResult({
          rows: indexes.map((idx) => ({
            name: idx.name,
            key: JSON.stringify(idx.key),
            unique: idx.unique ?? false,
            sparse: idx.sparse ?? false,
          })),
          rowCount: indexes.length,
          truncated: false,
        });
      }),
  );

  server.tool(
    'db_mongo_explain_find',
    'Return an execution plan for a MongoDB find operation.',
    {
      connection: z.string(),
      collection: z.string(),
      filter: z.record(z.unknown()).optional(),
      projection: z.record(z.unknown()).optional(),
      sort: z.record(z.union([z.literal(1), z.literal(-1)])).optional(),
    },
    async ({ connection, collection, filter, projection, sort }) =>
      runAudited(config, connection, 'db_mongo_explain_find', 'explain_find', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_explain_find requires a MongoDB connection.');
        }
        const plan = await (connector as MongoDbConnector).explainFind({
          collection,
          filter,
          projection,
          sort,
        });
        return JSON.stringify(plan, null, 2);
      }),
  );

  server.tool(
    'db_mongo_explain_aggregate',
    'Return an execution plan for a MongoDB aggregate pipeline.',
    {
      connection: z.string(),
      collection: z.string(),
      pipeline: z.array(z.record(z.unknown())),
    },
    async ({ connection, collection, pipeline }) =>
      runAudited(config, connection, 'db_mongo_explain_aggregate', 'explain_aggregate', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        validateMongoPipeline(pipeline, config.security, connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_explain_aggregate requires a MongoDB connection.');
        }
        const plan = await (connector as MongoDbConnector).explainAggregate({ collection, pipeline });
        return JSON.stringify(plan, null, 2);
      }),
  );

  server.tool(
    'db_mongo_insert',
    'Insert one or more documents into a MongoDB collection. Requires mode: readwrite and security.allowWriteOperations: true.',
    {
      connection: z.string(),
      collection: z.string(),
      documents: z.array(z.record(z.unknown())).min(1).describe('One or more documents to insert.'),
    },
    async ({ connection, collection, documents }) =>
      runAudited(config, connection, 'db_mongo_insert', 'insert', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        assertWriteAllowed(config.security, connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_insert requires a MongoDB connection.');
        }
        const result = await (connector as MongoDbConnector).insert({ collection, documents });
        return `Inserted ${result.insertedCount} document(s). IDs: ${JSON.stringify(result.insertedIds)}`;
      }),
  );

  server.tool(
    'db_mongo_update',
    'Update documents in a MongoDB collection matching a filter. Requires mode: readwrite and security.allowWriteOperations: true.',
    {
      connection: z.string(),
      collection: z.string(),
      filter: z.record(z.unknown()).describe('Non-empty MongoDB filter selecting documents to update.'),
      update: z.record(z.unknown()).describe('MongoDB update document, e.g. { $set: { ... } }.'),
      many: z
        .boolean()
        .optional()
        .describe('Update every matching document instead of just the first (default false).'),
    },
    async ({ connection, collection, filter, update, many }) =>
      runAudited(config, connection, 'db_mongo_update', 'update', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        assertWriteAllowed(config.security, connectionConfig);
        assertNonEmptyFilter(filter);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_update requires a MongoDB connection.');
        }
        const result = await (connector as MongoDbConnector).update({ collection, filter, update, many });
        return `Matched ${result.matchedCount}, modified ${result.modifiedCount} document(s).`;
      }),
  );

  server.tool(
    'db_mongo_delete',
    'Delete documents from a MongoDB collection matching a filter. Requires mode: readwrite and security.allowWriteOperations: true.',
    {
      connection: z.string(),
      collection: z.string(),
      filter: z.record(z.unknown()).describe('Non-empty MongoDB filter selecting documents to delete.'),
      many: z
        .boolean()
        .optional()
        .describe('Delete every matching document instead of just the first (default false).'),
    },
    async ({ connection, collection, filter, many }) =>
      runAudited(config, connection, 'db_mongo_delete', 'delete', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        assertWriteAllowed(config.security, connectionConfig);
        assertNonEmptyFilter(filter);
        const connector = registry.get(connection);
        if (connector.type !== 'mongodb') {
          throw new Error('db_mongo_delete requires a MongoDB connection.');
        }
        const result = await (connector as MongoDbConnector).delete({ collection, filter, many });
        return `Deleted ${result.deletedCount} document(s).`;
      }),
  );

  server.tool(
    'db_qdrant_search',
    'Run a vector similarity search against a Qdrant collection.',
    {
      connection: z.string(),
      collection: z.string(),
      vector: z.array(z.number()).describe('Query embedding vector.'),
      limit: z.number().int().positive().optional().describe('Max number of results (default 10).'),
      filter: z.record(z.unknown()).optional().describe('Optional Qdrant filter object.'),
      scoreThreshold: z.number().optional().describe('Optional minimum similarity score.'),
    },
    async ({ connection, collection, vector, limit, filter, scoreThreshold }) =>
      runAudited(config, connection, 'db_qdrant_search', 'search', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'qdrant') {
          throw new Error('db_qdrant_search requires a Qdrant connection.');
        }
        const resolvedLimit = resolveLimit(config.security, connectionConfig, limit);
        const result = await (connector as QdrantDbConnector).search({
          collection,
          vector,
          limit: resolvedLimit,
          filter,
          scoreThreshold,
        });
        return formatQueryResult(maskResult(result, config.security));
      }),
  );

  server.tool(
    'db_qdrant_scroll',
    'Browse or filter points in a Qdrant collection without a vector search.',
    {
      connection: z.string(),
      collection: z.string(),
      filter: z.record(z.unknown()).optional().describe('Optional Qdrant filter object.'),
      limit: z.number().int().positive().optional().describe('Max number of results (default 100).'),
      offset: z
        .union([z.string(), z.number()])
        .optional()
        .describe(
          'Continuation cursor from a previous call\'s "Next offset" (omit to start from the beginning).',
        ),
      withVector: z.boolean().optional().describe('Include the stored vector in results (default false).'),
    },
    async ({ connection, collection, filter, limit, offset, withVector }) =>
      runAudited(config, connection, 'db_qdrant_scroll', 'scroll', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'qdrant') {
          throw new Error('db_qdrant_scroll requires a Qdrant connection.');
        }
        const resolvedLimit = resolveLimit(config.security, connectionConfig, limit);
        const result = await (connector as QdrantDbConnector).scroll({
          collection,
          filter,
          limit: resolvedLimit,
          offset,
          withVector,
        });
        return formatQueryResult(maskResult(result, config.security));
      }),
  );

  server.tool(
    'db_qdrant_count',
    'Count points in a Qdrant collection with an optional filter.',
    {
      connection: z.string(),
      collection: z.string(),
      filter: z.record(z.unknown()).optional().describe('Optional Qdrant filter object.'),
    },
    async ({ connection, collection, filter }) =>
      runAudited(config, connection, 'db_qdrant_count', 'count', async () => {
        const connectionConfig = registry.getConfig(connection);
        assertAllowedObject(collection, 'table', connectionConfig);
        const connector = registry.get(connection);
        if (connector.type !== 'qdrant') {
          throw new Error('db_qdrant_count requires a Qdrant connection.');
        }
        const total = await (connector as QdrantDbConnector).count({ collection, filter });
        return `Count: ${total}`;
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

function buildSqlCountQuery(
  dbType: 'oracle' | 'mssql' | 'postgres' | 'mysql' | 'sqlite',
  schema: string | undefined,
  table: string,
  where?: string,
): string {
  let from: string;
  if (dbType === 'mssql') {
    from = schema ? `[${schema}].[${table}]` : `[${table}]`;
  } else if (dbType === 'postgres' || dbType === 'sqlite') {
    from = schema ? `"${schema}"."${table}"` : `"${table}"`;
  } else if (dbType === 'mysql') {
    from = schema ? `\`${schema}\`.\`${table}\`` : `\`${table}\``;
  } else {
    const owner = schema?.toUpperCase();
    const tbl = table.toUpperCase();
    from = owner ? `"${owner}"."${tbl}"` : `"${tbl}"`;
  }
  return where
    ? `SELECT COUNT(*) AS total FROM ${from} WHERE ${where}`
    : `SELECT COUNT(*) AS total FROM ${from}`;
}
