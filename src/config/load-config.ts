import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { appConfigSchema } from './schema.js';
import type { AppConfig } from '../types.js';

export const CONFIG_ENV_VAR = 'MCP_DB_CONFIG';

/**
 * `configPath` is optional because config can also come from the MCP_DB_CONFIG
 * environment variable (YAML or JSON text) instead of a file — this is what lets
 * container platforms that can't mount a project file (e.g. Smithery.ai) host
 * this server by injecting the whole config as one env var.
 */
export async function loadConfig(configPath?: string): Promise<AppConfig> {
  const raw = await readConfigSource(configPath);
  const parsed = YAML.parse(raw);
  const config = appConfigSchema.parse(parsed) as AppConfig;

  for (const [name, connection] of Object.entries(config.connections)) {
    connection.name = connection.name ?? name;
  }

  return config;
}

async function readConfigSource(configPath: string | undefined): Promise<string> {
  const fromEnv = process.env[CONFIG_ENV_VAR];
  if (fromEnv) {
    return fromEnv;
  }

  if (!configPath) {
    throw new Error(
      `No config source available. Pass a config file path or set ${CONFIG_ENV_VAR} to the config as YAML or JSON.`,
    );
  }

  return fs.readFile(path.resolve(configPath), 'utf8');
}

export function readSecret(value: string | undefined, envName: string | undefined): string {
  if (value) {
    return value;
  }
  if (envName && process.env[envName]) {
    return process.env[envName]!;
  }
  throw new Error(`Missing secret${envName ? ` from env ${envName}` : ''}`);
}
