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
