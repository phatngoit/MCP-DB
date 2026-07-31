#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Command } from 'commander';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };
import dotenv from 'dotenv';
import { CONFIG_ENV_VAR, loadConfig } from './config/load-config.js';
import { appConfigSchema } from './config/schema.js';
import { ConnectorRegistry } from './core/registry.js';
import { startHttpServer, startStdioServer } from './server.js';
import { runSetupWizard } from './setup/wizard.js';

const program = new Command();

program
  .name('mcp-db-connect')
  .description('Universal readonly-first MCP server for Oracle, MSSQL, PostgreSQL, MySQL/MariaDB, and MongoDB.')
  .version(version);

program
  .command('start')
  .description('Start the MCP server over stdio.')
  .option(
    '-c, --config <path>',
    'Path to YAML config file. Defaults to project mcp-db.local.yml or mcp-db.yml. Ignored if MCP_DB_CONFIG is set.',
  )
  .option('--env <path>', 'Path to .env file.')
  .option(
    '--project <path>',
    'Project directory used for config and .env discovery.',
    process.cwd(),
  )
  .action(async (options: { config?: string; env?: string; project: string }) => {
    const projectDir = resolveProjectDir(options.project);
    loadEnv(resolveEnvPath(options.env, projectDir));
    const config = await loadConfig(await resolveConfigPath(options.config, projectDir));
    await startStdioServer(config);
  });

program
  .command('serve-http')
  .description('Start the MCP server over Streamable HTTP.')
  .option(
    '-c, --config <path>',
    'Path to YAML config file. Defaults to project mcp-db.local.yml or mcp-db.yml. Ignored if MCP_DB_CONFIG is set.',
  )
  .option('--env <path>', 'Path to .env file.')
  .option(
    '--project <path>',
    'Project directory used for config and .env discovery.',
    process.cwd(),
  )
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
      project: string;
      host: string;
      port: number;
      path: string;
      apiKey?: string;
      apiKeyEnv?: string;
      allowedHosts?: string[];
    }) => {
      const projectDir = resolveProjectDir(options.project);
      loadEnv(resolveEnvPath(options.env, projectDir));
      const config = await loadConfig(await resolveConfigPath(options.config, projectDir));
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
  .option(
    '-c, --config <path>',
    'Path to YAML config file. Defaults to project mcp-db.local.yml or mcp-db.yml. Ignored if MCP_DB_CONFIG is set.',
  )
  .option('--project <path>', 'Project directory used for config discovery.', process.cwd())
  .action(async (options: { config?: string; project: string }) => {
    await loadConfig(await resolveConfigPath(options.config, resolveProjectDir(options.project)));
    process.stdout.write('Config is valid.\n');
  });

program
  .command('test-connections')
  .description('Test every configured database connection.')
  .option(
    '-c, --config <path>',
    'Path to YAML config file. Defaults to project mcp-db.local.yml or mcp-db.yml. Ignored if MCP_DB_CONFIG is set.',
  )
  .option('--env <path>', 'Path to .env file.')
  .option(
    '--project <path>',
    'Project directory used for config and .env discovery.',
    process.cwd(),
  )
  .action(async (options: { config?: string; env?: string; project: string }) => {
    const projectDir = resolveProjectDir(options.project);
    loadEnv(resolveEnvPath(options.env, projectDir));
    const config = await loadConfig(await resolveConfigPath(options.config, projectDir));
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
  .option('-o, --output <path>', 'Output path.', 'mcp-db.local.yml')
  .option('--project <path>', 'Project directory where files should be created.', process.cwd())
  .option('--env-output <path>', 'Create an example env file at this path.', '.env.example')
  .option('--no-gitignore', 'Do not update project .gitignore.')
  .action(
    async (options: {
      output: string;
      project: string;
      envOutput?: string;
      gitignore?: boolean;
    }) => {
      const projectDir = resolveProjectDir(options.project);
      const outputPath = path.resolve(projectDir, options.output);
      const exists = await fileExists(outputPath);
      if (exists) {
        throw new Error(`${outputPath} already exists.`);
      }
      await fs.writeFile(outputPath, exampleConfig(), 'utf8');
      process.stdout.write(`Created ${outputPath}\n`);

      if (options.envOutput) {
        const envOutputPath = path.resolve(projectDir, options.envOutput);
        if (!(await fileExists(envOutputPath))) {
          await fs.writeFile(envOutputPath, exampleEnv(), 'utf8');
          process.stdout.write(`Created ${envOutputPath}\n`);
        }
      }

      if (options.gitignore !== false) {
        await ensureGitignore(projectDir, [
          'node_modules/',
          '.env',
          'mcp-db.local.yml',
          'logs/',
          '.claude/settings.local.json',
        ]);
        process.stdout.write(`Updated ${path.join(projectDir, '.gitignore')}\n`);
      }
    },
  );

program
  .command('setup')
  .description('Run an interactive project setup wizard for AI clients and database connections.')
  .option('--project <path>', 'Project directory where files should be created.', process.cwd())
  .option(
    '--config <path>',
    'Config file path relative to the project directory.',
    'mcp-db.local.yml',
  )
  .option('--env <path>', 'Env file path relative to the project directory.', '.env')
  .option(
    '--ai <clients>',
    'Comma-separated AI clients: claude,codex,gemini,kimi,generic,all.',
    parseCommaList,
  )
  .option(
    '--db <databases>',
    'Comma-separated database types: oracle,mssql,mongodb,all.',
    parseCommaList,
  )
  .option('--force', 'Overwrite existing generated entries where possible.')
  .option('--no-gitignore', 'Do not update project .gitignore.')
  .action(
    async (options: {
      project: string;
      config: string;
      env: string;
      ai?: string[];
      db?: string[];
      force?: boolean;
      gitignore?: boolean;
    }) => {
      await runSetupWizard({
        projectDir: resolveProjectDir(options.project),
        configPath: options.config,
        envPath: options.env,
        selectedAiClients: options.ai,
        selectedDatabases: options.db,
        force: options.force === true,
        updateGitignore: options.gitignore !== false,
      });
    },
  );

program
  .command('ai-config')
  .description('Print project-local MCP setup snippets for common AI CLIs.')
  .action(() => {
    process.stdout.write(aiConfigSnippets());
  });

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

function loadEnv(envPath: string | undefined): void {
  if (envPath) {
    dotenv.config({ path: envPath });
  }
}

function resolveProjectDir(projectPath: string): string {
  return path.resolve(projectPath);
}

async function resolveConfigPath(
  configPath: string | undefined,
  projectDir: string,
): Promise<string | undefined> {
  if (process.env[CONFIG_ENV_VAR]) {
    return undefined;
  }

  if (configPath) {
    return path.resolve(projectDir, configPath);
  }

  const candidates = ['mcp-db.local.yml', 'mcp-db.yml', 'mcp-db.yaml'];
  for (const candidate of candidates) {
    const resolved = path.join(projectDir, candidate);
    if (await fileExists(resolved)) {
      return resolved;
    }
  }

  throw new Error(
    `No MCP DB config found in ${projectDir}. Create mcp-db.local.yml with "mcp-db-connect init", pass --config, or set ${CONFIG_ENV_VAR}.`,
  );
}

function resolveEnvPath(envPath: string | undefined, projectDir: string): string | undefined {
  if (envPath) {
    return path.resolve(projectDir, envPath);
  }

  return path.join(projectDir, '.env');
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

function resolveApiKey(
  apiKey: string | undefined,
  apiKeyEnv: string | undefined,
): string | undefined {
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

async function ensureGitignore(projectDir: string, entries: string[]): Promise<void> {
  const gitignorePath = path.join(projectDir, '.gitignore');
  let content = '';

  if (await fileExists(gitignorePath)) {
    content = await fs.readFile(gitignorePath, 'utf8');
  }

  const lines = new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const missing = entries.filter((entry) => !lines.has(entry));
  if (missing.length === 0) {
    return;
  }

  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  const section = `${prefix}${content.length > 0 ? '\n' : ''}# MCP DB Connect\n${missing.join('\n')}\n`;
  await fs.appendFile(gitignorePath, section, 'utf8');
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

function exampleEnv(): string {
  return `ORACLE_PASSWORD=change-me
MSSQL_PASSWORD=change-me
MONGODB_URI=mongodb://localhost:27017/appdb
`;
}

function aiConfigSnippets(): string {
  return `Recommended project setup:
  mcp-db-connect setup

Run these from your project root after creating mcp-db.local.yml and .env.

Claude Code CLI:
  claude mcp add --transport stdio db-connect --scope local -- npx mcp-db-connect start --project . --config ./mcp-db.local.yml --env ./.env

Codex CLI one-project install:
  mkdir .\\.mcp-tools\\db-connect
  npm --prefix .\\.mcp-tools\\db-connect install mcp-db-connect

Codex CLI .codex/config.toml:
  [mcp_servers.db-connect]
  command = '.\\.mcp-tools\\db-connect\\node_modules\\.bin\\mcp-db-connect.cmd'
  args = ["start", "--project", ".", "--config", '.\\mcp-db.local.yml', "--env", '.\\.env']
  enabled = true

  [mcp_servers.db-connect.env]
  LOG_LEVEL = "silent"

Gemini CLI .gemini/settings.json:
  {
    "mcpServers": {
      "db-connect": {
        "command": "mcp-db-connect",
        "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"]
      }
    }
  }

Kimi CLI .kimi/mcp.json:
  {
    "mcpServers": {
      "db-connect": {
        "command": "mcp-db-connect",
        "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"]
      }
    }
  }

  kimi --mcp-config-file .\\.kimi\\mcp.json

The server will use mcp-db.local.yml and .env from the project directory where the AI CLI runs.
`;
}
