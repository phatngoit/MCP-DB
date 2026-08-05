import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConnect, mockClose, adminMock, listCollectionsCursor, collectionMock, dbMock, dbFactory, MongoClientMock } =
  vi.hoisted(() => {
    const mockConnect = vi.fn().mockResolvedValue(undefined);
    const mockClose = vi.fn().mockResolvedValue(undefined);

    const adminMock = { listDatabases: vi.fn() };
    const listCollectionsCursor = { toArray: vi.fn() };
    const collectionMock = {
      find: vi.fn(),
      aggregate: vi.fn(),
      countDocuments: vi.fn(),
      indexes: vi.fn(),
      insertMany: vi.fn(),
      updateOne: vi.fn(),
      updateMany: vi.fn(),
      deleteOne: vi.fn(),
      deleteMany: vi.fn(),
    };

    const dbMock = {
      admin: vi.fn(() => adminMock),
      listCollections: vi.fn(() => listCollectionsCursor),
      collection: vi.fn(() => collectionMock),
      command: vi.fn().mockResolvedValue({ ok: 1 }),
    };

    const dbFactory = vi.fn(() => dbMock);

    const MongoClientMock = vi.fn().mockImplementation(function MongoClientCtor() {
      return { connect: mockConnect, close: mockClose, db: dbFactory };
    });

    return {
      mockConnect,
      mockClose,
      adminMock,
      listCollectionsCursor,
      collectionMock,
      dbMock,
      dbFactory,
      MongoClientMock,
    };
  });

vi.mock('mongodb', () => ({
  MongoClient: MongoClientMock,
}));

const { MongodbConnector } = await import('./mongodb.js');

function makeCursor(toArrayResult: unknown[] = [], explainResult: unknown = {}) {
  return {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(toArrayResult),
    explain: vi.fn().mockResolvedValue(explainResult),
  };
}

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    type: 'mongodb' as const,
    mode: 'readonly' as const,
    name: 'mongo_test',
    uri: 'mongodb://user:pass@localhost:27017/appdb',
    database: 'appdb',
    describeSampleSize: 20,
    ...overrides,
  };
}

describe('MongodbConnector', () => {
  beforeEach(() => {
    mockConnect.mockClear();
    mockClose.mockReset();
    MongoClientMock.mockClear();
    dbFactory.mockClear();
    adminMock.listDatabases.mockReset();
    listCollectionsCursor.toArray.mockReset();
    collectionMock.find.mockReset();
    collectionMock.aggregate.mockReset();
    collectionMock.countDocuments.mockReset();
    collectionMock.indexes.mockReset();
    collectionMock.insertMany.mockReset();
    collectionMock.updateOne.mockReset();
    collectionMock.updateMany.mockReset();
    collectionMock.deleteOne.mockReset();
    collectionMock.deleteMany.mockReset();
  });

  it('connects once and reuses the client across calls', async () => {
    dbMock.command.mockResolvedValue({ ok: 1 });
    const connector = new MongodbConnector(baseConfig());

    await connector.testConnection();
    await connector.testConnection();

    expect(MongoClientMock).toHaveBeenCalledTimes(1);
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it('maps listDatabases result into a flat string array', async () => {
    adminMock.listDatabases.mockResolvedValue({
      databases: [{ name: 'appdb' }, { name: 'admin' }],
    });
    const connector = new MongodbConnector(baseConfig());

    const schemas = await connector.listSchemas();

    expect(schemas).toEqual(['appdb', 'admin']);
  });

  it('maps listCollections result into TableInfo entries', async () => {
    listCollectionsCursor.toArray.mockResolvedValue([{ name: 'users' }, { name: 'orders' }]);
    const connector = new MongodbConnector(baseConfig());

    const tables = await connector.listTables();

    expect(tables).toEqual([
      { schema: 'appdb', name: 'users', type: 'COLLECTION' },
      { schema: 'appdb', name: 'orders', type: 'COLLECTION' },
    ]);
  });

  it('infers column types and nullability from sampled documents', async () => {
    collectionMock.find.mockReturnValue(
      makeCursor([
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: '30' },
        { name: 'Carol' },
      ]),
    );
    const connector = new MongodbConnector(baseConfig());

    const description = await connector.describeCollection('users');

    expect(description.columns).toEqual([
      { name: 'age', type: 'number | string', nullable: true, defaultValue: null },
      { name: 'name', type: 'string', nullable: false, defaultValue: null },
    ]);
  });

  it('uses the connection describeSampleSize as the default sample limit', async () => {
    const cursor = makeCursor([]);
    collectionMock.find.mockReturnValue(cursor);
    const connector = new MongodbConnector(baseConfig({ describeSampleSize: 50 }));

    await connector.describeCollection('users');

    expect(cursor.limit).toHaveBeenCalledWith(50);
  });

  it('lets a per-call sampleSize override the connection default', async () => {
    const cursor = makeCursor([]);
    collectionMock.find.mockReturnValue(cursor);
    const connector = new MongodbConnector(baseConfig({ describeSampleSize: 20 }));

    await connector.describeCollection('users', 5);

    expect(cursor.limit).toHaveBeenCalledWith(5);
  });

  it('passes sampleSize through describeTable to describeCollection', async () => {
    const cursor = makeCursor([]);
    collectionMock.find.mockReturnValue(cursor);
    const connector = new MongodbConnector(baseConfig({ describeSampleSize: 20 }));

    await connector.describeTable(undefined, 'users', 7);

    expect(cursor.limit).toHaveBeenCalledWith(7);
  });

  it('marks find() results truncated once the row count reaches maxRows', async () => {
    collectionMock.find.mockReturnValue(makeCursor([{ id: 1 }, { id: 2 }]));
    const connector = new MongodbConnector(baseConfig());

    const result = await connector.find({ collection: 'users', maxRows: 2 });

    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('passes skip through to the cursor for pagination', async () => {
    const cursor = makeCursor([]);
    collectionMock.find.mockReturnValue(cursor);
    const connector = new MongodbConnector(baseConfig());

    await connector.find({ collection: 'users', skip: 20 });

    expect(cursor.skip).toHaveBeenCalledWith(20);
  });

  it('defaults skip to 0 when not provided', async () => {
    const cursor = makeCursor([]);
    collectionMock.find.mockReturnValue(cursor);
    const connector = new MongodbConnector(baseConfig());

    await connector.find({ collection: 'users' });

    expect(cursor.skip).toHaveBeenCalledWith(0);
  });

  it('does not mark find() results truncated when below maxRows', async () => {
    collectionMock.find.mockReturnValue(makeCursor([{ id: 1 }]));
    const connector = new MongodbConnector(baseConfig());

    const result = await connector.find({ collection: 'users', maxRows: 10 });

    expect(result.truncated).toBe(false);
  });

  it('counts documents via countDocuments', async () => {
    collectionMock.countDocuments.mockResolvedValue(42);
    const connector = new MongodbConnector(baseConfig());

    const total = await connector.count({ collection: 'users' });

    expect(total).toBe(42);
  });

  it('maps index results into MongoIndexInfo entries', async () => {
    collectionMock.indexes.mockResolvedValue([
      { name: '_id_', key: { _id: 1 } },
      { name: 'email_unique', key: { email: 1 }, unique: true, sparse: false },
    ]);
    const connector = new MongodbConnector(baseConfig());

    const indexes = await connector.getIndexes('users');

    expect(indexes).toEqual([
      { name: '_id_', key: { _id: 1 }, unique: undefined, sparse: undefined },
      { name: 'email_unique', key: { email: 1 }, unique: true, sparse: false },
    ]);
  });

  it('inserts documents and maps the result', async () => {
    collectionMock.insertMany.mockResolvedValue({
      insertedCount: 2,
      insertedIds: { 0: 'a', 1: 'b' },
    });
    const connector = new MongodbConnector(baseConfig());

    const result = await connector.insert({
      collection: 'users',
      documents: [{ name: 'Alice' }, { name: 'Bob' }],
    });

    expect(result).toEqual({ insertedCount: 2, insertedIds: ['a', 'b'] });
    expect(collectionMock.insertMany).toHaveBeenCalledWith([{ name: 'Alice' }, { name: 'Bob' }]);
  });

  it('updates a single document by default', async () => {
    collectionMock.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    const connector = new MongodbConnector(baseConfig());

    const result = await connector.update({
      collection: 'users',
      filter: { _id: '1' },
      update: { $set: { name: 'Alice' } },
    });

    expect(result).toEqual({ matchedCount: 1, modifiedCount: 1 });
    expect(collectionMock.updateOne).toHaveBeenCalledWith({ _id: '1' }, { $set: { name: 'Alice' } });
    expect(collectionMock.updateMany).not.toHaveBeenCalled();
  });

  it('updates every matching document when many is true', async () => {
    collectionMock.updateMany.mockResolvedValue({ matchedCount: 5, modifiedCount: 5 });
    const connector = new MongodbConnector(baseConfig());

    const result = await connector.update({
      collection: 'users',
      filter: { active: true },
      update: { $set: { active: false } },
      many: true,
    });

    expect(result).toEqual({ matchedCount: 5, modifiedCount: 5 });
    expect(collectionMock.updateMany).toHaveBeenCalledWith(
      { active: true },
      { $set: { active: false } },
    );
  });

  it('deletes a single document by default', async () => {
    collectionMock.deleteOne.mockResolvedValue({ deletedCount: 1 });
    const connector = new MongodbConnector(baseConfig());

    const result = await connector.delete({ collection: 'users', filter: { _id: '1' } });

    expect(result).toEqual({ deletedCount: 1 });
    expect(collectionMock.deleteOne).toHaveBeenCalledWith({ _id: '1' });
    expect(collectionMock.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes every matching document when many is true', async () => {
    collectionMock.deleteMany.mockResolvedValue({ deletedCount: 3 });
    const connector = new MongodbConnector(baseConfig());

    const result = await connector.delete({
      collection: 'users',
      filter: { active: false },
      many: true,
    });

    expect(result).toEqual({ deletedCount: 3 });
    expect(collectionMock.deleteMany).toHaveBeenCalledWith({ active: false });
  });

  it('closes and clears the client', async () => {
    dbMock.command.mockResolvedValue({ ok: 1 });
    const connector = new MongodbConnector(baseConfig());

    await connector.testConnection();
    await connector.close();

    expect(mockClose).toHaveBeenCalledTimes(1);

    await connector.testConnection();
    expect(MongoClientMock).toHaveBeenCalledTimes(2);
  });
});
