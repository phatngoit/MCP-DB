import fs from 'node:fs/promises';
import path from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import YAML from 'yaml';
import { appConfigSchema } from '../config/schema.js';

type AiClient = 'claude' | 'codex' | 'gemini' | 'kimi' | 'generic';
type DatabaseType = 'oracle' | 'mssql' | 'mongodb';

interface SetupWizardOptions {
  projectDir: string;
  configPath: string;
  envPath: string;
  selectedAiClients?: string[];
  selectedDatabases?: string[];
  force: boolean;
  updateGitignore: boolean;
}

interface Choice<T extends string> {
  id: T;
  label: string;
  description: string;
}

interface SetupResult {
  changed: string[];
  skipped: string[];
  notes: string[];
}

interface EnvEntry {
  name: string;
  value: string;
}

type GeneratedConnection = Record<string, unknown>;

const aiChoices: Choice<AiClient>[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    description: 'Creates project .mcp.json.',
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    description: 'Creates project .codex/config.toml and local tool package folder.',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    description: 'Creates project .gemini/settings.json.',
  },
  {
    id: 'kimi',
    label: 'Kimi CLI',
    description: 'Creates project .kimi/mcp.json for kimi --mcp-config-file.',
  },
  {
    id: 'generic',
    label: 'Generic MCP JSON',
    description: 'Creates project .mcp-db-connect/mcp.json.',
  },
];

const databaseChoices: Choice<DatabaseType>[] = [
  {
    id: 'mssql',
    label: 'Microsoft SQL Server',
    description: 'Own host, port, database, username, password.',
  },
  {
    id: 'oracle',
    label: 'Oracle Database',
    description: 'Own host, listener port, service name, username, password.',
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    description: 'Own host, port, database, username, password or anonymous URI.',
  },
];

export async function runSetupWizard(options: SetupWizardOptions): Promise<void> {
  const projectDir = path.resolve(options.projectDir);
  const result: SetupResult = { changed: [], skipped: [], notes: [] };
  await fs.mkdir(projectDir, { recursive: true });

  const selectedAiClients = normalizeAiClients(options.selectedAiClients);
  const selectedDatabases = normalizeDatabases(options.selectedDatabases);
  if ((!selectedAiClients || !selectedDatabases) && !isInteractiveTerminal()) {
    throw new Error('Use --ai and --db when running setup outside an interactive terminal.');
  }

  const rl = createInterface({ input, output });
  try {
    const aiClients =
      selectedAiClients ??
      (await promptMultiple(rl, 'Choose AI clients to configure', aiChoices, 'all'));
    const databases =
      selectedDatabases ??
      (await promptMultiple(
        rl,
        'Choose database connections to configure',
        databaseChoices,
        'all',
      ));

    const generated = await collectConnections(rl, databases);
    await mergeConfigFile({
      filePath: path.resolve(projectDir, options.configPath),
      connections: generated.connections,
      force: options.force,
      result,
    });
    await mergeEnvFile({
      filePath: path.resolve(projectDir, options.envPath),
      entries: generated.envEntries,
      force: options.force,
      result,
    });

    if (options.updateGitignore) {
      await ensureGitignore(
        projectDir,
        [
          'node_modules/',
          '.env',
          'mcp-db.local.yml',
          'logs/',
          '.mcp-tools/',
          '.claude/settings.local.json',
        ],
        result,
      );
    }

    await writeAiClientConfigs({
      projectDir,
      aiClients,
      force: options.force,
      result,
    });
  } finally {
    rl.close();
  }

  printSummary(projectDir, result);
}

async function collectConnections(
  rl: Interface,
  databases: DatabaseType[],
): Promise<{ connections: Record<string, GeneratedConnection>; envEntries: EnvEntry[] }> {
  const connections: Record<string, GeneratedConnection> = {};
  const envEntries: EnvEntry[] = [];

  for (const database of databases) {
    let index = 1;
    let addAnother = true;

    while (addAnother) {
      output.write(`\n${databaseLabel(database)} connection ${index}\n`);

      if (database === 'mssql') {
        const name = await promptConnectionName(
          rl,
          defaultConnectionName(database, index),
          connections,
        );
        const host = await promptRequired(rl, 'Host', 'localhost');
        const port = await promptInteger(rl, 'Port', 1433);
        const dbName = await promptRequired(rl, 'Database', 'appdb');
        const username = await promptRequired(rl, 'Username', 'app_readonly');
        const password = await promptText(rl, 'Password', 'change-me');
        const passwordEnv = envName(name, 'PASSWORD');
        output.write(`  → Password saved as ${passwordEnv} in .env\n`);

        connections[name] = {
          type: 'mssql',
          host,
          port,
          database: dbName,
          username,
          passwordEnv,
          encrypt: true,
          trustServerCertificate: true,
          mode: 'readonly',
        };
        envEntries.push({ name: passwordEnv, value: password });
      }

      if (database === 'oracle') {
        const name = await promptConnectionName(
          rl,
          defaultConnectionName(database, index),
          connections,
        );
        const host = await promptRequired(rl, 'Host', 'localhost');
        const port = await promptInteger(rl, 'Port', 1521);
        const serviceName = await promptRequired(rl, 'Service name', 'ORCLPDB1');
        const username = await promptRequired(rl, 'Username', 'app_readonly');
        const password = await promptText(rl, 'Password', 'change-me');
        const passwordEnv = envName(name, 'PASSWORD');
        output.write(`  → Password saved as ${passwordEnv} in .env\n`);

        connections[name] = {
          type: 'oracle',
          host,
          port,
          serviceName,
          username,
          passwordEnv,
          clientMode: 'thin',
          mode: 'readonly',
        };
        envEntries.push({ name: passwordEnv, value: password });
      }

      if (database === 'mongodb') {
        const name = await promptConnectionName(
          rl,
          defaultConnectionName(database, index),
          connections,
        );
        const host = await promptRequired(rl, 'Host', 'localhost');
        const port = await promptInteger(rl, 'Port', 27017);
        const dbName = await promptRequired(rl, 'Database', 'appdb');
        const username = await promptText(rl, 'Username (blank for no auth)', '');
        const password = username
          ? await promptText(rl, 'Password', '')
          : '';
        const uriEnv = envName(name, 'URI');
        output.write(`  → Connection URI saved as ${uriEnv} in .env\n`);

        connections[name] = {
          type: 'mongodb',
          uriEnv,
          database: dbName,
          mode: 'readonly',
        };
        envEntries.push({
          name: uriEnv,
          value: buildMongoUri({ host, port, database: dbName, username, password, authSource: '' }),
        });
      }

      index += 1;
      addAnother = await promptBoolean(
        rl,
        `Add another ${databaseLabel(database)} connection`,
        false,
      );
    }
  }

  return { connections, envEntries };
}

async function mergeConfigFile(args: {
  filePath: string;
  connections: Record<string, GeneratedConnection>;
  force: boolean;
  result: SetupResult;
}): Promise<void> {
  const config = (await readYamlObject(args.filePath)) ?? {};
  const root = isRecord(config) ? config : {};
  const existingConnections = isRecord(root.connections) ? root.connections : {};
  root.security = isRecord(root.security)
    ? root.security
    : {
        defaultMaxRows: 100,
        queryTimeoutMs: 10000,
        blockMultiStatement: true,
        allowWriteOperations: false,
        maskColumns: ['password', 'token', 'secret', 'api_key'],
        auditLogPath: './logs/mcp-db-connect.audit.jsonl',
      };

  let changed = false;
  for (const [name, connection] of Object.entries(args.connections)) {
    if (Object.hasOwn(existingConnections, name) && !args.force) {
      args.result.skipped.push(`${args.filePath}: connection ${name} already exists`);
      continue;
    }
    existingConnections[name] = connection;
    changed = true;
  }

  root.connections = existingConnections;
  const parsed = appConfigSchema.parse(root);
  if (changed || !(await fileExists(args.filePath))) {
    await fs.mkdir(path.dirname(args.filePath), { recursive: true });
    await fs.writeFile(args.filePath, YAML.stringify(parsed), 'utf8');
    args.result.changed.push(args.filePath);
  }
}

async function mergeEnvFile(args: {
  filePath: string;
  entries: EnvEntry[];
  force: boolean;
  result: SetupResult;
}): Promise<void> {
  const exists = await fileExists(args.filePath);
  const original = exists ? await fs.readFile(args.filePath, 'utf8') : '';
  let content = original;
  let changed = false;

  for (const entry of args.entries) {
    const line = `${entry.name}=${formatEnvValue(entry.value)}`;
    const pattern = new RegExp(`^\\s*${escapeRegExp(entry.name)}\\s*=.*$`, 'm');
    if (pattern.test(content)) {
      if (!args.force) {
        args.result.skipped.push(`${args.filePath}: ${entry.name} already exists`);
        continue;
      }
      content = content.replace(pattern, line);
      changed = true;
      continue;
    }

    const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    content = `${content}${prefix}${line}\n`;
    changed = true;
  }

  if (changed || !exists) {
    await fs.mkdir(path.dirname(args.filePath), { recursive: true });
    await fs.writeFile(args.filePath, content, 'utf8');
    args.result.changed.push(args.filePath);
  }
}

async function writeAiClientConfigs(args: {
  projectDir: string;
  aiClients: AiClient[];
  force: boolean;
  result: SetupResult;
}): Promise<void> {
  const server = mcpServerDefinition();

  for (const aiClient of args.aiClients) {
    if (aiClient === 'claude') {
      await mergeMcpJson(path.join(args.projectDir, '.mcp.json'), server, args.force, args.result);
    }

    if (aiClient === 'codex') {
      await writeCodexConfig(args.projectDir, args.force, args.result);
      await writeCodexLocalPackage(args.projectDir, args.force, args.result);
      args.result.notes.push(
        'Codex CLI: run "npm --prefix .\\.mcp-tools\\db-connect install" from the project root before opening Codex.',
      );
    }

    if (aiClient === 'gemini') {
      await mergeMcpJson(
        path.join(args.projectDir, '.gemini', 'settings.json'),
        server,
        args.force,
        args.result,
      );
    }

    if (aiClient === 'kimi') {
      await mergeMcpJson(
        path.join(args.projectDir, '.kimi', 'mcp.json'),
        server,
        args.force,
        args.result,
      );
      args.result.notes.push('Kimi CLI: start with "kimi --mcp-config-file .\\.kimi\\mcp.json".');
    }

    if (aiClient === 'generic') {
      await mergeMcpJson(
        path.join(args.projectDir, '.mcp-db-connect', 'mcp.json'),
        server,
        args.force,
        args.result,
      );
    }
  }
}

async function mergeMcpJson(
  filePath: string,
  server: Record<string, unknown>,
  force: boolean,
  result: SetupResult,
): Promise<void> {
  const exists = await fileExists(filePath);
  const parsed = exists ? JSON.parse(await fs.readFile(filePath, 'utf8')) : {};
  const root = isRecord(parsed) ? parsed : {};
  const mcpServers = isRecord(root.mcpServers) ? root.mcpServers : {};

  if (Object.hasOwn(mcpServers, 'db-connect') && !force) {
    result.skipped.push(`${filePath}: mcpServers.db-connect already exists`);
    return;
  }

  mcpServers['db-connect'] = server;
  root.mcpServers = mcpServers;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(root, null, 2)}\n`, 'utf8');
  result.changed.push(filePath);
}

async function writeCodexConfig(
  projectDir: string,
  force: boolean,
  result: SetupResult,
): Promise<void> {
  const filePath = path.join(projectDir, '.codex', 'config.toml');
  const exists = await fileExists(filePath);
  const content = exists ? await fs.readFile(filePath, 'utf8') : '';
  const block = `[mcp_servers.db-connect]
command = '.\\.mcp-tools\\db-connect\\node_modules\\.bin\\mcp-db-connect.cmd'
args = ["start", "--project", ".", "--config", '.\\mcp-db.local.yml', "--env", '.\\.env']
enabled = true

[mcp_servers.db-connect.env]
LOG_LEVEL = "silent"
`;

  if (content.includes('[mcp_servers.db-connect]') && !force) {
    result.skipped.push(`${filePath}: mcp_servers.db-connect already exists`);
    return;
  }

  const withoutExisting = content.includes('[mcp_servers.db-connect]')
    ? removeTomlTable(
        removeTomlTable(content, 'mcp_servers.db-connect.env'),
        'mcp_servers.db-connect',
      )
    : content;
  const nextContent = `${withoutExisting}${withoutExisting.length > 0 && !withoutExisting.endsWith('\n') ? '\n' : ''}${
    withoutExisting.trim().length > 0 ? '\n' : ''
  }${block}`;

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(
    filePath,
    nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`,
    'utf8',
  );
  result.changed.push(filePath);
}

async function writeCodexLocalPackage(
  projectDir: string,
  force: boolean,
  result: SetupResult,
): Promise<void> {
  const filePath = path.join(projectDir, '.mcp-tools', 'db-connect', 'package.json');
  const exists = await fileExists(filePath);
  if (exists && !force) {
    result.skipped.push(`${filePath}: package.json already exists`);
    return;
  }

  const content = {
    private: true,
    dependencies: {
      'mcp-db-connect': 'latest',
    },
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
  result.changed.push(filePath);
}

async function ensureGitignore(
  projectDir: string,
  entries: string[],
  result: SetupResult,
): Promise<void> {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const exists = await fileExists(gitignorePath);
  const content = exists ? await fs.readFile(gitignorePath, 'utf8') : '';
  const lines = new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const missing = entries.filter((entry) => !lines.has(entry));
  if (missing.length === 0) {
    result.skipped.push(`${gitignorePath}: entries already exist`);
    return;
  }

  const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  const section = `${prefix}${content.length > 0 ? '\n' : ''}# MCP DB Connect\n${missing.join('\n')}\n`;
  await fs.writeFile(gitignorePath, `${content}${section}`, 'utf8');
  result.changed.push(gitignorePath);
}

async function promptMultiple<T extends string>(
  rl: Interface,
  label: string,
  choices: Choice<T>[],
  defaultValue: string,
): Promise<T[]> {
  output.write(`\n${label}\n`);
  choices.forEach((choice, index) => {
    output.write(`  ${index + 1}. ${choice.label} - ${choice.description}\n`);
  });

  while (true) {
    const answer = (
      await promptText(rl, 'Enter numbers or ids separated by comma, or "all"', defaultValue)
    ).toLowerCase();
    if (answer === 'all') {
      return choices.map((choice) => choice.id);
    }

    const selected = answer
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => choiceFromInput(item, choices));

    if (selected.every(Boolean)) {
      return unique(selected as T[]);
    }

    output.write('Invalid selection. Try again.\n');
  }
}

async function promptRequired(
  rl: Interface,
  label: string,
  defaultValue?: string,
): Promise<string> {
  while (true) {
    const answer = await promptText(rl, label, defaultValue ?? '');
    if (answer) {
      return answer;
    }
    output.write(`${label} is required.\n`);
  }
}

async function promptConnectionName(
  rl: Interface,
  defaultValue: string,
  existingConnections: Record<string, GeneratedConnection>,
): Promise<string> {
  while (true) {
    const name = await promptRequired(rl, 'Connection name', defaultValue);
    if (!Object.hasOwn(existingConnections, name)) {
      return name;
    }
    output.write(`Connection ${name} was already added in this setup run. Use another name.\n`);
  }
}

async function promptInteger(rl: Interface, label: string, defaultValue: number): Promise<number> {
  while (true) {
    const answer = await promptText(rl, label, String(defaultValue));
    const parsed = Number.parseInt(answer, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    output.write(`${label} must be a positive integer.\n`);
  }
}

async function promptBoolean(
  rl: Interface,
  label: string,
  defaultValue: boolean,
): Promise<boolean> {
  const defaultText = defaultValue ? 'Y/n' : 'y/N';
  while (true) {
    const answer = (
      await promptText(rl, `${label} (${defaultText})`, defaultValue ? 'y' : 'n')
    ).toLowerCase();
    if (['y', 'yes'].includes(answer)) {
      return true;
    }
    if (['n', 'no'].includes(answer)) {
      return false;
    }
    output.write('Enter y or n.\n');
  }
}

async function promptText(rl: Interface, label: string, defaultValue: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const answer = await rl.question(`${label}${suffix}: `);
  return answer.trim() || defaultValue;
}

function normalizeAiClients(values: string[] | undefined): AiClient[] | undefined {
  return normalizeSelection(values, aiChoices, {
    claude: 'claude',
    'claude-code': 'claude',
    codex: 'codex',
    gemini: 'gemini',
    kimi: 'kimi',
    generic: 'generic',
    json: 'generic',
  });
}

function normalizeDatabases(values: string[] | undefined): DatabaseType[] | undefined {
  return normalizeSelection(values, databaseChoices, {
    oracle: 'oracle',
    ora: 'oracle',
    mssql: 'mssql',
    sqlserver: 'mssql',
    'sql-server': 'mssql',
    mongodb: 'mongodb',
    mongo: 'mongodb',
  });
}

function normalizeSelection<T extends string>(
  values: string[] | undefined,
  choices: Choice<T>[],
  aliases: Record<string, T>,
): T[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }

  const normalized = values
    .flatMap((value) => value.split(','))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.includes('all')) {
    return choices.map((choice) => choice.id);
  }

  const selected = normalized.map((value) => aliases[value]);
  const invalid = normalized.filter((_, index) => !selected[index]);
  if (invalid.length > 0) {
    throw new Error(`Unsupported selection: ${invalid.join(', ')}`);
  }

  return unique(selected);
}

function choiceFromInput<T extends string>(
  inputValue: string,
  choices: Choice<T>[],
): T | undefined {
  const index = Number.parseInt(inputValue, 10);
  if (Number.isInteger(index) && index >= 1 && index <= choices.length) {
    return choices[index - 1]?.id;
  }

  return choices.find((choice) => choice.id === inputValue)?.id;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function isInteractiveTerminal(): boolean {
  return Boolean(input.isTTY && output.isTTY);
}

function mcpServerDefinition(): Record<string, unknown> {
  return {
    command: 'npx',
    args: ['mcp-db-connect', 'start', '--project', '.', '--config', './mcp-db.local.yml', '--env', './.env'],
    env: {
      LOG_LEVEL: 'silent',
    },
  };
}

function databaseLabel(database: DatabaseType): string {
  if (database === 'mssql') {
    return 'Microsoft SQL Server';
  }
  if (database === 'oracle') {
    return 'Oracle Database';
  }
  return 'MongoDB';
}

function defaultConnectionName(database: DatabaseType, index: number): string {
  const baseNames: Record<DatabaseType, string> = {
    mssql: 'mssql_local',
    oracle: 'oracle_local',
    mongodb: 'mongo_local',
  };
  const baseName = baseNames[database];
  return index === 1 ? baseName : `${baseName}_${index}`;
}

function envName(connectionName: string, suffix: string): string {
  return `${connectionName}_${suffix}`
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function buildMongoUri(args: {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  authSource: string;
}): string {
  const credentials = args.username
    ? `${encodeURIComponent(args.username)}:${encodeURIComponent(args.password)}@`
    : '';
  const database = encodeURIComponent(args.database);
  const query = args.authSource ? `?authSource=${encodeURIComponent(args.authSource)}` : '';
  return `mongodb://${credentials}${args.host}:${args.port}/${database}${query}`;
}

function formatEnvValue(value: string): string {
  if (/^[a-zA-Z0-9_./:@?&=%+\-]*$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

async function readYamlObject(filePath: string): Promise<unknown | undefined> {
  if (!(await fileExists(filePath))) {
    return undefined;
  }

  return YAML.parse(await fs.readFile(filePath, 'utf8'));
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function printSummary(projectDir: string, result: SetupResult): void {
  output.write(`\nMCP DB setup completed for ${projectDir}\n`);

  if (result.changed.length > 0) {
    output.write('\nChanged files:\n');
    for (const filePath of unique(result.changed)) {
      output.write(`  - ${path.relative(projectDir, filePath) || filePath}\n`);
    }
  }

  if (result.skipped.length > 0) {
    output.write('\nSkipped:\n');
    for (const item of unique(result.skipped)) {
      output.write(`  - ${item}\n`);
    }
  }

  if (result.notes.length > 0) {
    output.write('\nNext steps:\n');
    for (const note of unique(result.notes)) {
      output.write(`  - ${note}\n`);
    }
  }

  output.write(
    '\nRun "mcp-db-connect test-connections" from the project root to verify database access.\n',
  );
  output.write(
    'Edit mcp-db.local.yml to configure advanced options (encrypt, Oracle Thick mode, allowlists, row limits).\n',
  );
}

function removeTomlTable(content: string, tableName: string): string {
  const lines = content.split(/\r?\n/);
  const outputLines: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === `[${tableName}]`) {
      skipping = true;
      continue;
    }

    if (skipping && /^\[[^\]]+]/.test(trimmed)) {
      skipping = false;
    }

    if (!skipping) {
      outputLines.push(line);
    }
  }

  return outputLines.join('\n').trimEnd();
}
