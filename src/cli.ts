#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { Command } from 'commander';
import dotenv from 'dotenv';
import { loadConfig } from './config/load-config.js';
import { appConfigSchema } from './config/schema.js';
import { ConnectorRegistry } from './core/registry.js';
import { startHttpServer, startStdioServer } from './server.js';

const program = new Command();

program
  .name('mcp-db-connect')
  .description('Universal readonly-first MCP server for Oracle, MSSQL, and MongoDB.')
  .version('0.1.2');

program
  .command('start')
  .description('Start the MCP server over stdio.')
  .requiredOption('-c, --config <path>', 'Path to YAML config file.')
  .option('--env <path>', 'Path to .env file.')
  .action(async (options: { config: string; env?: string }) => {
    loadEnv(options.env);
    const config = await loadConfig(options.config);
    await startStdioServer(config);
  });

program
  .command('serve-http')
  .description('Start the MCP server over Streamable HTTP.')
  .requiredOption('-c, --config <path>', 'Path to YAML config file.')
  .option('--env <path>', 'Path to .env file.')
  .option('--host <host>', 'Host to bind.', '127.0.0.1')
  .option('--port <port>', 'Port to bind.', parseIntegerOption, 3000)
  .option('--path <path>', 'MCP HTTP endpoint path.', '/mcp')
  .option('--api-key <key>', 'Require this API key for HTTP MCP requests.')
  .option('--api-key-env <name>', 'Read the HTTP MCP API key from an environment variable.')
  .option(
    '--allowed-hosts <hosts>',
    'Comma-separated Host header allowlist for DNS rebinding protection.',
    parseCommaList,
  )
  .action(
    async (options: {
      config: string;
      env?: string;
      host: string;
      port: number;
      path: string;
      apiKey?: string;
      apiKeyEnv?: string;
      allowedHosts?: string[];
    }) => {
      loadEnv(options.env);
      const config = await loadConfig(options.config);
      await startHttpServer(config, {
        host: options.host,
        port: options.port,
        path: normalizeEndpointPath(options.path),
        allowedHosts: options.allowedHosts,
        apiKey: resolveApiKey(options.apiKey, options.apiKeyEnv),
      });
    },
  );

program
  .command('validate-config')
  .description('Validate a config file without starting the MCP server.')
  .requiredOption('-c, --config <path>', 'Path to YAML config file.')
  .action(async (options: { config: string }) => {
    await loadConfig(options.config);
    process.stdout.write('Config is valid.\n');
  });

program
  .command('test-connections')
  .description('Test every configured database connection.')
  .requiredOption('-c, --config <path>', 'Path to YAML config file.')
  .option('--env <path>', 'Path to .env file.')
  .action(async (options: { config: string; env?: string }) => {
    loadEnv(options.env);
    const config = await loadConfig(options.config);
    const registry = new ConnectorRegistry(config);
    let failed = 0;

    try {
      for (const connection of registry.list()) {
        const started = Date.now();
        try {
          const result = await registry.get(connection.name).testConnection();
          process.stdout.write(
            `${connection.name}\t${connection.type}\tOK\t${Date.now() - started}ms\t${result.message}\n`,
          );
        } catch (error) {
          failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          process.stdout.write(
            `${connection.name}\t${connection.type}\tFAIL\t${Date.now() - started}ms\t${message}\n`,
          );
        }
      }
    } finally {
      await registry.close();
    }

    if (failed > 0) {
      process.exitCode = 1;
    }
  });

program
  .command('init')
  .description('Create an example mcp-db.yml config file.')
  .option('-o, --output <path>', 'Output path.', 'mcp-db.yml')
  .action(async (options: { output: string }) => {
    const outputPath = path.resolve(options.output);
    const exists = await fileExists(outputPath);
    if (exists) {
      throw new Error(`${outputPath} already exists.`);
    }
    await fs.writeFile(outputPath, exampleConfig(), 'utf8');
    process.stdout.write(`Created ${outputPath}\n`);
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

function loadEnv(envPath: string | undefined): void {
  if (envPath) {
    dotenv.config({ path: path.resolve(envPath) });
  } else {
    dotenv.config();
  }
}

function parseIntegerOption(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function parseCommaList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEndpointPath(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

function resolveApiKey(apiKey: string | undefined, apiKeyEnv: string | undefined): string | undefined {
  if (apiKey && apiKeyEnv) {
    throw new Error('Use either --api-key or --api-key-env, not both.');
  }

  if (!apiKeyEnv) {
    return apiKey;
  }

  const value = process.env[apiKeyEnv];
  if (!value) {
    throw new Error(`Environment variable ${apiKeyEnv} is not set.`);
  }

  return value;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function exampleConfig(): string {
  const config = appConfigSchema.parse({
    security: {},
    connections: {
      oracle_local: {
        type: 'oracle',
        host: 'localhost',
        port: 1521,
        serviceName: 'ORCLPDB1',
        username: 'app_readonly',
        passwordEnv: 'ORACLE_PASSWORD',
      },
      mssql_local: {
        type: 'mssql',
        host: 'localhost',
        port: 1433,
        database: 'appdb',
        username: 'sa',
        passwordEnv: 'MSSQL_PASSWORD',
        encrypt: true,
        trustServerCertificate: true,
      },
      mongo_local: {
        type: 'mongodb',
        uriEnv: 'MONGODB_URI',
        database: 'appdb',
      },
    },
  });

  return `security:
  defaultMaxRows: ${config.security.defaultMaxRows}
  queryTimeoutMs: ${config.security.queryTimeoutMs}
  blockMultiStatement: true
  allowWriteOperations: false
  maskColumns:
    - password
    - token
    - secret
    - api_key
  auditLogPath: ./logs/mcp-db-connect.audit.jsonl

connections:
  oracle_local:
    type: oracle
    host: localhost
    port: 1521
    serviceName: ORCLPDB1
    username: app_readonly
    passwordEnv: ORACLE_PASSWORD
    mode: readonly

  mssql_local:
    type: mssql
    host: localhost
    port: 1433
    database: appdb
    username: sa
    passwordEnv: MSSQL_PASSWORD
    encrypt: true
    trustServerCertificate: true
    mode: readonly

  mongo_local:
    type: mongodb
    uriEnv: MONGODB_URI
    database: appdb
    mode: readonly
`;
}
