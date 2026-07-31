import { QdrantClient } from '@qdrant/js-client-rest';
import type {
  ColumnInfo,
  ExplainResult,
  QdrantConnectionConfig,
  QdrantCountInput,
  QdrantDbConnector,
  QdrantScrollInput,
  QdrantSearchInput,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

export class QdrantConnector implements QdrantDbConnector {
  readonly type = 'qdrant' as const;
  readonly name: string;
  private client?: QdrantClient;

  constructor(private readonly config: QdrantConnectionConfig) {
    this.name = config.name ?? 'qdrant';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const client = this.getClient();
    await client.getCollections();
    return { ok: true, message: 'Qdrant connection succeeded.' };
  }

  async listSchemas(): Promise<string[]> {
    return [];
  }

  async listTables(): Promise<TableInfo[]> {
    return this.listCollections();
  }

  async listCollections(): Promise<TableInfo[]> {
    const client = this.getClient();
    const result = await client.getCollections();
    return result.collections.map((collection) => ({
      name: collection.name,
      type: 'COLLECTION',
    }));
  }

  async describeTable(_schema: string | undefined, table: string): Promise<TableDescription> {
    return this.describeCollection(table);
  }

  async describeCollection(collection: string): Promise<TableDescription> {
    const client = this.getClient();
    const info = await client.getCollection(collection);
    const columns: ColumnInfo[] = [];

    for (const [vectorName, summary] of describeVectorsConfig(info.config?.params?.vectors)) {
      columns.push({ name: `vector:${vectorName}`, type: summary });
    }

    for (const [field, fieldSchema] of Object.entries(info.payload_schema ?? {})) {
      columns.push({ name: field, type: fieldSchema?.data_type ?? 'unknown' });
    }

    return { name: collection, columns };
  }

  async query(_input: QueryInput): Promise<QueryResult> {
    throw new Error('Use db_qdrant_search or db_qdrant_scroll for Qdrant connections.');
  }

  async explainQuery(_input: QueryInput): Promise<ExplainResult> {
    throw new Error('Qdrant does not support execution plans.');
  }

  async search(input: QdrantSearchInput): Promise<QueryResult> {
    const client = this.getClient();
    const limit = input.limit ?? 10;
    const points = await client.search(input.collection, {
      vector: input.vector,
      limit,
      filter: input.filter,
      with_payload: input.withPayload ?? true,
      score_threshold: input.scoreThreshold,
    });
    return { rows: points, rowCount: points.length, truncated: points.length >= limit };
  }

  async scroll(input: QdrantScrollInput): Promise<QueryResult> {
    const client = this.getClient();
    const limit = input.limit ?? 100;
    const result = await client.scroll(input.collection, {
      filter: input.filter,
      limit,
      with_payload: input.withPayload ?? true,
      with_vector: input.withVector ?? false,
    });
    const points = result.points ?? [];
    return { rows: points, rowCount: points.length, truncated: points.length >= limit };
  }

  async count(input: QdrantCountInput): Promise<number> {
    const client = this.getClient();
    const result = await client.count(input.collection, { filter: input.filter, exact: true });
    return result.count;
  }

  async close(): Promise<void> {
    this.client = undefined;
  }

  private getClient(): QdrantClient {
    if (!this.client) {
      const url = readSecret(this.config.url, this.config.urlEnv);
      const apiKey =
        this.config.apiKey ??
        (this.config.apiKeyEnv ? process.env[this.config.apiKeyEnv] : undefined);
      this.client = new QdrantClient({ url, apiKey });
    }
    return this.client;
  }
}

function describeVectorsConfig(vectors: unknown): Array<[string, string]> {
  if (!vectors || typeof vectors !== 'object') {
    return [];
  }

  if ('size' in vectors) {
    const params = vectors as { size: number; distance: string };
    return [['default', `size=${params.size}, distance=${params.distance}`]];
  }

  return Object.entries(vectors as Record<string, { size: number; distance: string }>).map(
    ([vectorName, params]) => [vectorName, `size=${params.size}, distance=${params.distance}`],
  );
}
