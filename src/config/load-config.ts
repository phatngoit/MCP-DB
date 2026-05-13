import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { appConfigSchema } from './schema.js';
import type { AppConfig } from '../types.js';

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const absolutePath = path.resolve(configPath);
  const raw = await fs.readFile(absolutePath, 'utf8');
  const parsed = YAML.parse(raw);
  const config = appConfigSchema.parse(parsed) as AppConfig;

  for (const [name, connection] of Object.entries(config.connections)) {
    connection.name = connection.name ?? name;
  }

  return config;
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
