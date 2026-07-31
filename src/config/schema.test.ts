import { describe, expect, it } from 'vitest';
import { appConfigSchema } from './schema.js';

function withConnections(connections: Record<string, unknown>) {
  return { connections };
}

describe('appConfigSchema — Oracle connection modes', () => {
  it('accepts the existing structured host/serviceName shape', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          ora: {
            type: 'oracle',
            host: 'localhost',
            serviceName: 'ORCLPDB1',
            username: 'app_readonly',
            passwordEnv: 'ORA_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a connectDescriptor with no host', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          ora: {
            type: 'oracle',
            connectDescriptor: '(DESCRIPTION=(HOST=x))',
            username: 'app_readonly',
            passwordEnv: 'ORA_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects an Oracle connection with neither host nor connectDescriptor', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          ora: {
            type: 'oracle',
            username: 'app_readonly',
            passwordEnv: 'ORA_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).toThrow();
  });
});

describe('appConfigSchema — MSSQL connection modes', () => {
  it('accepts the existing structured host/database shape', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          ms: {
            type: 'mssql',
            host: 'localhost',
            database: 'appdb',
            username: 'app_readonly',
            passwordEnv: 'MS_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a connectionStringEnv with no host/database/username', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          ms: {
            type: 'mssql',
            connectionStringEnv: 'MS_CONNECTION_STRING',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects an MSSQL connection with neither connection string nor host+database', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          ms: {
            type: 'mssql',
            username: 'app_readonly',
            passwordEnv: 'MS_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).toThrow();
  });
});

describe('appConfigSchema — PostgreSQL connection modes', () => {
  it('accepts the existing structured host/database shape', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          pg: {
            type: 'postgres',
            host: 'localhost',
            database: 'appdb',
            username: 'app_readonly',
            passwordEnv: 'PG_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a connectionStringEnv with no host/database/username', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          pg: {
            type: 'postgres',
            connectionStringEnv: 'PG_CONNECTION_STRING',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a PostgreSQL connection with neither connection string nor host+database', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          pg: {
            type: 'postgres',
            username: 'app_readonly',
            passwordEnv: 'PG_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).toThrow();
  });

  it('defaults the port to 5432', () => {
    const config = appConfigSchema.parse(
      withConnections({
        pg: {
          type: 'postgres',
          host: 'localhost',
          database: 'appdb',
          username: 'app_readonly',
          passwordEnv: 'PG_PW',
          mode: 'readonly',
        },
      }),
    );
    expect((config.connections.pg as { port: number }).port).toBe(5432);
  });
});

describe('appConfigSchema — MySQL connection modes', () => {
  it('accepts the existing structured host/database shape', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          my: {
            type: 'mysql',
            host: 'localhost',
            database: 'appdb',
            username: 'app_readonly',
            passwordEnv: 'MY_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a connectionStringEnv with no host/database/username', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          my: {
            type: 'mysql',
            connectionStringEnv: 'MY_CONNECTION_STRING',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a MySQL connection with neither connection string nor host+database', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          my: {
            type: 'mysql',
            username: 'app_readonly',
            passwordEnv: 'MY_PW',
            mode: 'readonly',
          },
        }),
      ),
    ).toThrow();
  });

  it('defaults the port to 3306', () => {
    const config = appConfigSchema.parse(
      withConnections({
        my: {
          type: 'mysql',
          host: 'localhost',
          database: 'appdb',
          username: 'app_readonly',
          passwordEnv: 'MY_PW',
          mode: 'readonly',
        },
      }),
    );
    expect((config.connections.my as { port: number }).port).toBe(3306);
  });
});

describe('appConfigSchema — Qdrant connection modes', () => {
  it('accepts a urlEnv with no apiKey', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          qd: {
            type: 'qdrant',
            urlEnv: 'QDRANT_URL',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a url with an apiKeyEnv', () => {
    expect(() =>
      appConfigSchema.parse(
        withConnections({
          qd: {
            type: 'qdrant',
            url: 'http://localhost:6333',
            apiKeyEnv: 'QDRANT_API_KEY',
            mode: 'readonly',
          },
        }),
      ),
    ).not.toThrow();
  });
});

describe('appConfigSchema — MongoDB connection modes', () => {
  it('defaults describeSampleSize to 20', () => {
    const config = appConfigSchema.parse(
      withConnections({
        mg: {
          type: 'mongodb',
          uriEnv: 'MONGODB_URI',
          database: 'appdb',
          mode: 'readonly',
        },
      }),
    );
    expect((config.connections.mg as { describeSampleSize: number }).describeSampleSize).toBe(20);
  });

  it('accepts an explicit describeSampleSize', () => {
    const config = appConfigSchema.parse(
      withConnections({
        mg: {
          type: 'mongodb',
          uriEnv: 'MONGODB_URI',
          database: 'appdb',
          describeSampleSize: 50,
          mode: 'readonly',
        },
      }),
    );
    expect((config.connections.mg as { describeSampleSize: number }).describeSampleSize).toBe(50);
  });
});
