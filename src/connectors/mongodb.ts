import { MongoClient } from 'mongodb';
import type {
  MongoAggregateInput,
  MongoConnectionConfig,
  MongoDbConnector,
  MongoFindInput,
  QueryInput,
  QueryResult,
  TableDescription,
  TableInfo,
} from '../types.js';
import { readSecret } from '../config/load-config.js';

export class MongodbConnector implements MongoDbConnector {
  readonly type = 'mongodb' as const;
  readonly name: string;
  private client?: MongoClient;

  constructor(private readonly config: MongoConnectionConfig) {
    this.name = config.name ?? 'mongodb';
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const client = await this.getClient();
    await client.db(this.config.database).command({ ping: 1 });
    return { ok: true, message: 'MongoDB connection succeeded.' };
  }

  async listSchemas(): Promise<string[]> {
    const client = await this.getClient();
    const result = await client.db().admin().listDatabases();
    return result.databases.map((database) => database.name);
  }

  async listTables(): Promise<TableInfo[]> {
    return this.listCollections();
  }

  async listCollections(): Promise<TableInfo[]> {
    const db = (await this.getClient()).db(this.config.database);
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    return collections.map((collection) => ({
      schema: this.config.database,
      name: collection.name,
      type: 'COLLECTION',
    }));
  }

  async describeTable(_schema: string | undefined, table: string): Promise<TableDescription> {
    return this.describeCollection(table);
  }

  async describeCollection(collection: string): Promise<TableDescription> {
    const db = (await this.getClient()).db(this.config.database);
    const samples = await db.collection(collection).find({}).limit(20).toArray();
    const columns = inferMongoColumns(samples);
    return { schema: this.config.database, name: collection, columns };
  }

  async query(_input: QueryInput): Promise<QueryResult> {
    throw new Error('Use db_mongo_find or db_mongo_aggregate for MongoDB connections.');
  }

  async explainQuery(_input: QueryInput): Promise<never> {
    throw new Error('Use MongoDB explain through driver-specific tools in a future release.');
  }

  async find(input: MongoFindInput): Promise<QueryResult> {
    const db = (await this.getClient()).db(this.config.database);
    const maxRows = input.maxRows ?? 100;
    const cursor = db
      .collection(input.collection)
      .find(input.filter ?? {}, {
        projection: input.projection,
        maxTimeMS: this.config.queryTimeoutMs,
      })
      .sort(input.sort ?? {})
      .limit(maxRows);
    const rows = await cursor.toArray();
    return { rows, rowCount: rows.length, truncated: rows.length >= maxRows };
  }

  async aggregate(input: MongoAggregateInput): Promise<QueryResult> {
    const db = (await this.getClient()).db(this.config.database);
    const maxRows = input.maxRows ?? 100;
    const pipeline = [...input.pipeline, { $limit: maxRows }];
    const rows = await db
      .collection(input.collection)
      .aggregate(pipeline, { maxTimeMS: this.config.queryTimeoutMs })
      .toArray();
    return { rows, rowCount: rows.length, truncated: rows.length >= maxRows };
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
    }
  }

  private async getClient(): Promise<MongoClient> {
    if (!this.client) {
      this.client = new MongoClient(readSecret(this.config.uri, this.config.uriEnv), {
        serverSelectionTimeoutMS: this.config.queryTimeoutMs,
      });
      await this.client.connect();
    }
    return this.client;
  }
}

function inferMongoType(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value instanceof Date) {
    return 'date';
  }
  return typeof value;
}

function inferMongoColumns(samples: Array<Record<string, unknown>>): TableDescription['columns'] {
  const fields = new Map<string, { types: Set<string>; seen: number }>();

  for (const sample of samples) {
    for (const [key, value] of Object.entries(sample)) {
      const field = fields.get(key) ?? { types: new Set<string>(), seen: 0 };
      field.types.add(inferMongoType(value));
      field.seen += 1;
      fields.set(key, field);
    }
  }

  return [...fields.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, field]) => ({
      name,
      type: [...field.types].sort().join(' | '),
      nullable: field.seen < samples.length,
      defaultValue: null,
    }));
}
