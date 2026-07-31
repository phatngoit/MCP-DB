import { beforeEach, describe, expect, it, vi } from 'vitest';

const { clientMock, QdrantClientMock } = vi.hoisted(() => {
  const clientMock = {
    getCollections: vi.fn(),
    getCollection: vi.fn(),
    search: vi.fn(),
    scroll: vi.fn(),
    count: vi.fn(),
  };
  const QdrantClientMock = vi.fn().mockImplementation(function QdrantClientCtor() {
    return clientMock;
  });
  return { clientMock, QdrantClientMock };
});

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: QdrantClientMock,
}));

const { QdrantConnector } = await import('./qdrant.js');

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    type: 'qdrant' as const,
    mode: 'readonly' as const,
    name: 'qdrant_test',
    url: 'http://localhost:6333',
    ...overrides,
  };
}

describe('QdrantConnector', () => {
  beforeEach(() => {
    QdrantClientMock.mockClear();
    clientMock.getCollections.mockReset();
    clientMock.getCollection.mockReset();
    clientMock.search.mockReset();
    clientMock.scroll.mockReset();
    clientMock.count.mockReset();
  });

  it('creates the client once and reuses it across calls', async () => {
    clientMock.getCollections.mockResolvedValue({ collections: [] });
    const connector = new QdrantConnector(baseConfig());

    await connector.listCollections();
    await connector.listCollections();

    expect(QdrantClientMock).toHaveBeenCalledTimes(1);
  });

  it('passes url and apiKey from config to the client', async () => {
    clientMock.getCollections.mockResolvedValue({ collections: [] });
    const connector = new QdrantConnector(baseConfig({ apiKey: 'secret-key' }));

    await connector.listCollections();

    expect(QdrantClientMock).toHaveBeenCalledWith({
      url: 'http://localhost:6333',
      apiKey: 'secret-key',
    });
  });

  it('resolves apiKeyEnv from the environment when apiKey is not set directly', async () => {
    process.env.QDRANT_TEST_API_KEY = 'env-key';
    clientMock.getCollections.mockResolvedValue({ collections: [] });
    const connector = new QdrantConnector(baseConfig({ apiKeyEnv: 'QDRANT_TEST_API_KEY' }));

    await connector.listCollections();

    expect(QdrantClientMock).toHaveBeenCalledWith({
      url: 'http://localhost:6333',
      apiKey: 'env-key',
    });
    delete process.env.QDRANT_TEST_API_KEY;
  });

  it('maps getCollections result into TableInfo entries', async () => {
    clientMock.getCollections.mockResolvedValue({
      collections: [{ name: 'embeddings' }, { name: 'documents' }],
    });
    const connector = new QdrantConnector(baseConfig());

    const tables = await connector.listCollections();

    expect(tables).toEqual([
      { name: 'embeddings', type: 'COLLECTION' },
      { name: 'documents', type: 'COLLECTION' },
    ]);
  });

  it('describes a collection with a single unnamed vector and payload schema', async () => {
    clientMock.getCollection.mockResolvedValue({
      config: { params: { vectors: { size: 384, distance: 'Cosine' } } },
      payload_schema: {
        title: { data_type: 'text' },
        year: { data_type: 'integer' },
      },
    });
    const connector = new QdrantConnector(baseConfig());

    const description = await connector.describeCollection('documents');

    expect(description.columns).toEqual([
      { name: 'vector:default', type: 'size=384, distance=Cosine' },
      { name: 'title', type: 'text' },
      { name: 'year', type: 'integer' },
    ]);
  });

  it('describes a collection with multiple named vectors', async () => {
    clientMock.getCollection.mockResolvedValue({
      config: {
        params: {
          vectors: {
            text: { size: 384, distance: 'Cosine' },
            image: { size: 512, distance: 'Dot' },
          },
        },
      },
      payload_schema: {},
    });
    const connector = new QdrantConnector(baseConfig());

    const description = await connector.describeCollection('documents');

    expect(description.columns).toEqual([
      { name: 'vector:text', type: 'size=384, distance=Cosine' },
      { name: 'vector:image', type: 'size=512, distance=Dot' },
    ]);
  });

  it('marks search() results truncated once the row count reaches the limit', async () => {
    clientMock.search.mockResolvedValue([
      { id: 1, score: 0.9 },
      { id: 2, score: 0.8 },
    ]);
    const connector = new QdrantConnector(baseConfig());

    const result = await connector.search({ collection: 'documents', vector: [0.1, 0.2], limit: 2 });

    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('defaults search() limit to 10 when not provided', async () => {
    clientMock.search.mockResolvedValue([]);
    const connector = new QdrantConnector(baseConfig());

    await connector.search({ collection: 'documents', vector: [0.1] });

    expect(clientMock.search).toHaveBeenCalledWith(
      'documents',
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('maps scroll() points and respects the with_vector default of false', async () => {
    clientMock.scroll.mockResolvedValue({ points: [{ id: 1, payload: { title: 'A' } }] });
    const connector = new QdrantConnector(baseConfig());

    const result = await connector.scroll({ collection: 'documents' });

    expect(result.rows).toEqual([{ id: 1, payload: { title: 'A' } }]);
    expect(clientMock.scroll).toHaveBeenCalledWith(
      'documents',
      expect.objectContaining({ with_vector: false, with_payload: true, limit: 100 }),
    );
  });

  it('counts points via the client count API', async () => {
    clientMock.count.mockResolvedValue({ count: 7 });
    const connector = new QdrantConnector(baseConfig());

    const total = await connector.count({ collection: 'documents' });

    expect(total).toBe(7);
  });

  it('recreates the client after close()', async () => {
    clientMock.getCollections.mockResolvedValue({ collections: [] });
    const connector = new QdrantConnector(baseConfig());

    await connector.listCollections();
    await connector.close();
    await connector.listCollections();

    expect(QdrantClientMock).toHaveBeenCalledTimes(2);
  });

  it('rejects db_query-style calls with a pointer to dedicated tools', async () => {
    const connector = new QdrantConnector(baseConfig());

    await expect(connector.query({ query: 'SELECT 1' })).rejects.toThrow(/db_qdrant_search/);
  });
});
