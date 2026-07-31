import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CONFIG_ENV_VAR, loadConfig } from './load-config.js';

const YAML_CONFIG = `
connections:
  pg_local:
    type: postgres
    host: localhost
    port: 5432
    database: appdb
    username: app_readonly
    password: secret
    mode: readonly
`;

const JSON_CONFIG = JSON.stringify({
  connections: {
    pg_local: {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'appdb',
      username: 'app_readonly',
      password: 'secret',
      mode: 'readonly',
    },
  },
});

describe('loadConfig', () => {
  afterEach(() => {
    delete process.env[CONFIG_ENV_VAR];
  });

  it('reads config from a file when MCP_DB_CONFIG is not set', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-db-config-'));
    const filePath = path.join(dir, 'mcp-db.yml');
    await fs.writeFile(filePath, YAML_CONFIG, 'utf8');

    const config = await loadConfig(filePath);

    expect(config.connections.pg_local.type).toBe('postgres');
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('reads YAML config from the MCP_DB_CONFIG environment variable, ignoring configPath', async () => {
    process.env[CONFIG_ENV_VAR] = YAML_CONFIG;

    const config = await loadConfig('/does/not/exist.yml');

    expect(config.connections.pg_local.type).toBe('postgres');
  });

  it('reads JSON config from the MCP_DB_CONFIG environment variable', async () => {
    process.env[CONFIG_ENV_VAR] = JSON_CONFIG;

    const config = await loadConfig();

    expect(config.connections.pg_local).toMatchObject({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
    });
  });

  it('sets the connection name from the config key when loaded from an env var', async () => {
    process.env[CONFIG_ENV_VAR] = YAML_CONFIG;

    const config = await loadConfig();

    expect(config.connections.pg_local.name).toBe('pg_local');
  });

  it('throws a clear error when neither a config path nor MCP_DB_CONFIG is available', async () => {
    await expect(loadConfig()).rejects.toThrow(/MCP_DB_CONFIG/);
  });
});
