# Connection-String Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the setup wizard's per-field DB prompts (host/port/database/username/password) with a single "connection string" prompt per connection, for MSSQL, Oracle, and MongoDB.

**Architecture:** Add a new optional connection-string field to the Oracle and MSSQL config schema/types (mirroring MongoDB's existing `uri`/`uriEnv`), teach both connectors to use it when present (bypassing structured-field construction), add a small pure-function parser module for the two shapes of Oracle string, and rewire the wizard's prompt loop to ask for one string per connection instead of five fields.

**Tech Stack:** TypeScript (ESM/NodeNext), Zod, Vitest, `mssql`/`oracledb`/`mongodb` npm packages.

## Global Constraints

- Node.js `>=20.10`; ESM-only, all local imports use `.js` extensions (NodeNext resolution) even though source is `.ts`.
- `strict: true` TypeScript — no implicit `any`, handle `undefined` from newly-optional fields explicitly.
- Passwords/credentials must never be written to YAML — only to `.env`, referenced by an `*Env` field name. This applies to every new field introduced here.
- Existing structured YAML connections (`host`/`port`/`database`/... without a connection string) must keep validating and connecting exactly as today — this is an additive input mode, not a replacement.
- No new connector-level or wizard-level automated tests requiring a live DB or simulated readline/stdin — matches this project's existing convention (see `CLAUDE.md` "Testing" section and `docs/integration-testing.md`). Only the new pure-function parser module and the Zod schema get unit tests.
- Reuse `readSecret(value, envName)` from `src/config/load-config.ts` for every secret lookup — do not hand-roll env var reads.

---

### Task 1: Connection-string parser module

**Files:**
- Create: `src/setup/connection-string-parser.ts`
- Create: `src/setup/connection-string-parser.test.ts`

**Interfaces:**
- Produces (used by Task 4):
  - `interface OracleParsedConnectionString { username: string; password?: string; connectDescriptor: string }`
  - `interface MongoParsedConnectionString { uri: string; database: string }`
  - `function parseOracleConnectionString(input: string): OracleParsedConnectionString | null`
  - `function parseMongoConnectionString(uri: string): MongoParsedConnectionString | null`
  - `function extractMongoDatabaseName(uri: string): string | null`
  - `function parseMssqlConnectionString(input: string): string | null`

- [x] **Step 1: Write the failing test file**

Create `src/setup/connection-string-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  extractMongoDatabaseName,
  parseMongoConnectionString,
  parseMssqlConnectionString,
  parseOracleConnectionString,
} from './connection-string-parser.js';

const ORACLE_ODP_NET_EXAMPLE =
  'Data Source=(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=10.20.30.15)(PORT=1521)))(CONNECT_DATA=(SERVER=POOLED)(SERVICE_NAME=DEMOPDB1)));User Id=demo_ora_user;Password=demo_ora_pass1;Validate Connection=true;Max Pool Size=1000';

const MSSQL_EXAMPLE =
  'Server=10.20.30.53,1439;Database=DemoDb;User ID=demo_ms_user;Password=demo_ms_pass1;MultipleActiveResultSets=True;TrustServerCertificate=True;';

const MONGO_EXAMPLE = 'mongodb://demo_mongo_user:demo_mongo_pass1@10.20.30.10:27017/demo_billing_db';

describe('parseOracleConnectionString', () => {
  it('parses an ODP.NET connection string, keeping the descriptor intact', () => {
    const result = parseOracleConnectionString(ORACLE_ODP_NET_EXAMPLE);
    expect(result).toEqual({
      username: 'demo_ora_user',
      password: 'demo_ora_pass1',
      connectDescriptor:
        '(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=10.20.30.15)(PORT=1521)))(CONNECT_DATA=(SERVER=POOLED)(SERVICE_NAME=DEMOPDB1)))',
    });
  });

  it('parses an Easy Connect string with embedded credentials', () => {
    const result = parseOracleConnectionString('app_readonly/secret@localhost:1521/ORCLPDB1');
    expect(result).toEqual({
      username: 'app_readonly',
      password: 'secret',
      connectDescriptor: 'localhost:1521/ORCLPDB1',
    });
  });

  it('parses an Easy Connect string with no password', () => {
    const result = parseOracleConnectionString('app_readonly/@localhost:1521/ORCLPDB1');
    expect(result).toEqual({
      username: 'app_readonly',
      password: undefined,
      connectDescriptor: 'localhost:1521/ORCLPDB1',
    });
  });

  it('returns null for an unrecognized format', () => {
    expect(parseOracleConnectionString('not a connection string')).toBeNull();
  });

  it('returns null for an ODP.NET string missing User Id', () => {
    expect(
      parseOracleConnectionString('Data Source=(DESCRIPTION=(HOST=x));Password=secret'),
    ).toBeNull();
  });
});

describe('extractMongoDatabaseName', () => {
  it('extracts the database name from a standard URI', () => {
    expect(extractMongoDatabaseName(MONGO_EXAMPLE)).toBe('demo_billing_db');
  });

  it('extracts the database name ignoring query params', () => {
    expect(
      extractMongoDatabaseName('mongodb+srv://user:pass@cluster.mongodb.net/mydb?retryWrites=true'),
    ).toBe('mydb');
  });

  it('returns null when the URI has no path', () => {
    expect(extractMongoDatabaseName('mongodb://host:27017')).toBeNull();
  });
});

describe('parseMongoConnectionString', () => {
  it('parses a full Mongo URI', () => {
    expect(parseMongoConnectionString(MONGO_EXAMPLE)).toEqual({
      uri: MONGO_EXAMPLE,
      database: 'demo_billing_db',
    });
  });

  it('returns null for a non-mongodb URI', () => {
    expect(parseMongoConnectionString('postgres://user:pass@host/db')).toBeNull();
  });

  it('returns null when the database name is missing', () => {
    expect(parseMongoConnectionString('mongodb://host:27017')).toBeNull();
  });
});

describe('parseMssqlConnectionString', () => {
  it('accepts a classic ADO connection string verbatim', () => {
    expect(parseMssqlConnectionString(MSSQL_EXAMPLE)).toBe(MSSQL_EXAMPLE);
  });

  it('returns null for input with no key=value pairs', () => {
    expect(parseMssqlConnectionString('just some random text')).toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/setup/connection-string-parser.test.ts`
Expected: FAIL — `Cannot find module './connection-string-parser.js'` (file doesn't exist yet).

- [x] **Step 3: Implement the parser module**

Create `src/setup/connection-string-parser.ts`:

```ts
export interface OracleParsedConnectionString {
  username: string;
  password?: string;
  connectDescriptor: string;
}

export interface MongoParsedConnectionString {
  uri: string;
  database: string;
}

export function parseOracleConnectionString(input: string): OracleParsedConnectionString | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/data\s*source\s*=/i.test(trimmed)) {
    return parseOdpNetConnectionString(trimmed);
  }

  return parseOracleEasyConnect(trimmed);
}

function parseOdpNetConnectionString(input: string): OracleParsedConnectionString | null {
  const pairs = new Map<string, string>();
  for (const segment of input.split(';')) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) continue;
    const eqIndex = trimmedSegment.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmedSegment.slice(0, eqIndex).trim().replace(/\s+/g, '').toLowerCase();
    const value = trimmedSegment.slice(eqIndex + 1).trim();
    pairs.set(key, value);
  }

  const connectDescriptor = pairs.get('datasource');
  const username = pairs.get('userid') ?? pairs.get('uid');
  const password = pairs.get('password') ?? pairs.get('pwd');
  if (!connectDescriptor || !username) {
    return null;
  }

  return { username, password: password || undefined, connectDescriptor };
}

function parseOracleEasyConnect(input: string): OracleParsedConnectionString | null {
  const match = input.match(/^([^/@]+)\/([^@]*)@(.+)$/);
  if (!match) {
    return null;
  }

  const [, username, password, connectDescriptor] = match;
  const trimmedUsername = username.trim();
  const trimmedDescriptor = connectDescriptor.trim();
  if (!trimmedUsername || !trimmedDescriptor) {
    return null;
  }

  return {
    username: trimmedUsername,
    password: password.trim() || undefined,
    connectDescriptor: trimmedDescriptor,
  };
}

export function extractMongoDatabaseName(uri: string): string | null {
  const schemeEnd = uri.indexOf('://');
  if (schemeEnd === -1) {
    return null;
  }

  const afterScheme = uri.slice(schemeEnd + 3);
  const pathStart = afterScheme.indexOf('/');
  if (pathStart === -1) {
    return null;
  }

  const database = afterScheme.slice(pathStart + 1).split('?')[0].trim();
  return database || null;
}

export function parseMongoConnectionString(uri: string): MongoParsedConnectionString | null {
  const trimmed = uri.trim();
  if (!/^mongodb(\+srv)?:\/\//i.test(trimmed)) {
    return null;
  }

  const database = extractMongoDatabaseName(trimmed);
  if (!database) {
    return null;
  }

  return { uri: trimmed, database };
}

export function parseMssqlConnectionString(input: string): string | null {
  const trimmed = input.trim();
  const looksValid = /[A-Za-z][A-Za-z0-9 ]*=[^;]+/.test(trimmed);
  return looksValid ? trimmed : null;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/setup/connection-string-parser.test.ts`
Expected: PASS — all cases green.

- [x] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0.

- [x] **Step 6: Commit**

```bash
git add src/setup/connection-string-parser.ts src/setup/connection-string-parser.test.ts
git commit -m "feat(setup): add connection-string parser for Oracle/MSSQL/Mongo"
```

---

### Task 2: Config schema and type changes

**Files:**
- Modify: `src/types.ts:16-47` (`OracleConnectionConfig`, `MssqlConnectionConfig`)
- Modify: `src/config/schema.ts:16-47` (`oracleConnectionSchema`, `mssqlConnectionSchema`, and how they're wired into `appConfigSchema`)
- Create: `src/config/schema.test.ts`

**Interfaces:**
- Produces (used by Task 3 and Task 4):
  - `OracleConnectionConfig.connectDescriptor?: string`
  - `OracleConnectionConfig.host?: string` (now optional; was required)
  - `MssqlConnectionConfig.connectionString?: string`
  - `MssqlConnectionConfig.connectionStringEnv?: string`
  - `MssqlConnectionConfig.host?: string`, `.database?: string`, `.username?: string` (now optional; were required)
  - `appConfigSchema` rejects an Oracle connection with neither `connectDescriptor` nor `host`, and an MSSQL connection with neither `connectionString`/`connectionStringEnv` nor (`host` and `database`).

- [x] **Step 1: Write the failing schema test**

Create `src/config/schema.test.ts`:

```ts
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
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/config/schema.test.ts`
Expected: FAIL — the "connectDescriptor"/"connectionStringEnv" cases throw because those fields don't exist yet (Zod strips unknown keys by default, so `host`/`database` end up missing and the currently-required fields fail validation).

- [x] **Step 3: Update `src/types.ts`**

Replace lines 16-47:

```ts
export interface OracleConnectionConfig extends BaseConnectionConfig {
  type: 'oracle';
  host?: string;
  port: number;
  serviceName?: string;
  sid?: string;
  connectDescriptor?: string;
  username: string;
  password?: string;
  passwordEnv?: string;
  clientMode?: 'thin' | 'thick';
  clientLibDir?: string;
  clientLibDirEnv?: string;
}

export interface MssqlConnectionConfig extends BaseConnectionConfig {
  type: 'mssql';
  host?: string;
  port: number;
  database?: string;
  username?: string;
  password?: string;
  passwordEnv?: string;
  connectionString?: string;
  connectionStringEnv?: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export interface MongoConnectionConfig extends BaseConnectionConfig {
  type: 'mongodb';
  uri?: string;
  uriEnv?: string;
  database: string;
}
```

(Only `OracleConnectionConfig` and `MssqlConnectionConfig` change; `MongoConnectionConfig` is shown for context and stays identical.)

- [x] **Step 4: Update `src/config/schema.ts`**

Replace lines 16-67 with:

```ts
const oracleConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('oracle'),
  host: z.string().optional(),
  port: z.number().int().positive().default(1521),
  serviceName: z.string().optional(),
  sid: z.string().optional(),
  connectDescriptor: z.string().optional(),
  username: z.string(),
  password: z.string().optional(),
  passwordEnv: z.string().optional(),
  clientMode: z.enum(['thin', 'thick']).default('thin'),
  clientLibDir: z.string().optional(),
  clientLibDirEnv: z.string().optional(),
});

const mssqlConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('mssql'),
  host: z.string().optional(),
  port: z.number().int().positive().default(1433),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  passwordEnv: z.string().optional(),
  connectionString: z.string().optional(),
  connectionStringEnv: z.string().optional(),
  encrypt: z.boolean().default(true),
  trustServerCertificate: z.boolean().default(false),
});

const mongoConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('mongodb'),
  uri: z.string().optional(),
  uriEnv: z.string().optional(),
  database: z.string(),
});

const dbConnectionSchema = z
  .discriminatedUnion('type', [oracleConnectionSchema, mssqlConnectionSchema, mongoConnectionSchema])
  .superRefine((config, ctx) => {
    if (config.type === 'oracle' && !config.connectDescriptor && !config.host) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Oracle connection requires either connectDescriptor, or host with serviceName/sid.',
        path: ['host'],
      });
    }

    if (
      config.type === 'mssql' &&
      !config.connectionString &&
      !config.connectionStringEnv &&
      (!config.host || !config.database)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'MSSQL connection requires either connectionString/connectionStringEnv, or host and database.',
        path: ['host'],
      });
    }
  });

export const appConfigSchema = z.object({
  security: z
    .object({
      defaultMaxRows: z.number().int().positive().default(100),
      queryTimeoutMs: z.number().int().positive().default(10_000),
      blockMultiStatement: z.boolean().default(true),
      allowWriteOperations: z.boolean().default(false),
      maskColumns: z.array(z.string()).default(['password', 'token', 'secret', 'api_key']),
      auditLogPath: z.string().optional(),
    })
    .default({}),
  connections: z.record(dbConnectionSchema),
});
```

- [x] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/config/schema.test.ts`
Expected: PASS — all 6 cases green.

- [x] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (This will surface any place in `src/` that assumed `host`/`database`/`username` were always defined — none exist yet outside the connectors touched in Task 3, but re-run after Task 3 too.)

- [x] **Step 7: Commit**

```bash
git add src/types.ts src/config/schema.ts src/config/schema.test.ts
git commit -m "feat(config): support raw connection-string mode for Oracle and MSSQL"
```

---

### Task 3: Connector support for connection-string mode

**Files:**
- Modify: `src/connectors/oracle.ts:316-324` (`connectString()`)
- Modify: `src/connectors/mssql.ts:217-237` (`getPool()`)

**Interfaces:**
- Consumes: `OracleConnectionConfig.connectDescriptor`, `MssqlConnectionConfig.connectionString`/`connectionStringEnv` (from Task 2); `readSecret(value, envName)` from `src/config/load-config.ts` (existing).
- Produces: no new exports — same public `DbConnector` methods, now also correct when the new fields are set.

This task has no dedicated unit test: the project does not unit-test connector code against a live database (see `CLAUDE.md` "Testing" section) — correctness here is verified by `npm run typecheck`/`npm run build` (compiles against the new optional-field types) plus the existing full test suite (must still pass unchanged), and end-to-end later via `mcp-db-connect test-connections` against a real database. `impact({target: "connectString", direction: "upstream", repo: "MCP-DB"})` / `impact({target: "getPool", direction: "upstream", repo: "MCP-DB"})` should be run before editing to confirm blast radius stays inside `oracle.ts`/`mssql.ts` — GitNexus already confirmed in a prior session that `MssqlConnector` methods only have in-file callers plus the `register-tools.ts` `DbConnector` interface call sites, which don't change shape here.

- [x] **Step 1: Update `src/connectors/oracle.ts`**

Replace the `connectString()` method (lines 316-324):

```ts
  private connectString(): string {
    if (this.config.connectDescriptor) {
      return this.config.connectDescriptor;
    }
    if (this.config.host && this.config.serviceName) {
      return `${this.config.host}:${this.config.port}/${this.config.serviceName}`;
    }
    if (this.config.host && this.config.sid) {
      return `${this.config.host}:${this.config.port}:${this.config.sid}`;
    }
    throw new Error('Oracle connection requires either connectDescriptor, or host with serviceName/sid.');
  }
```

- [x] **Step 2: Update `src/connectors/mssql.ts`**

Replace the `getPool()` method (lines 217-237):

```ts
  private async getPool(): Promise<ConnectionPool> {
    if (!this.pool) {
      const hasConnectionString = Boolean(
        this.config.connectionString || this.config.connectionStringEnv,
      );
      const poolConfig = hasConnectionString
        ? readSecret(this.config.connectionString, this.config.connectionStringEnv)
        : {
            server: this.config.host,
            port: this.config.port,
            database: this.config.database,
            user: this.config.username,
            password: readSecret(this.config.password, this.config.passwordEnv),
            requestTimeout: this.config.queryTimeoutMs,
            options: {
              encrypt: this.config.encrypt,
              trustServerCertificate: this.config.trustServerCertificate,
            },
            pool: {
              min: 0,
              max: 4,
            },
          };
      this.pool = await new sql.ConnectionPool(poolConfig).connect();
    }
    return this.pool;
  }
```

- [x] **Step 3: Typecheck, lint, build, and run the full test suite**

Run: `npm run typecheck && npm run lint && npm run build && npm test`
Expected: all four exit 0 — 0 new type errors from the now-optional `host`/`database`/`username`/`serviceName`/`sid` fields, and all existing tests (including Task 1 and Task 2's new tests) still pass.

- [x] **Step 4: Commit**

```bash
git add src/connectors/oracle.ts src/connectors/mssql.ts
git commit -m "feat(connectors): use raw connection string when configured (Oracle/MSSQL)"
```

---

### Task 4: Wizard integration

**Files:**
- Modify: `src/setup/wizard.ts:68-84` (`databaseChoices` descriptions)
- Modify: `src/setup/wizard.ts:153-260` (`collectConnections` and its three per-DB blocks)
- Modify: `src/setup/wizard.ts` (remove now-dead `promptInteger` and `buildMongoUri`, add new `promptConnectionString` helper)
- Modify: `src/setup/wizard.ts:1-6` (imports — add the parser module)

**Interfaces:**
- Consumes (from Task 1): `parseOracleConnectionString`, `parseMongoConnectionString`, `parseMssqlConnectionString` from `./connection-string-parser.js`.
- Consumes (from Task 2): the new `OracleConnectionConfig`/`MssqlConnectionConfig` optional fields (written into the `GeneratedConnection` objects, which are `Record<string, unknown>` validated later by `appConfigSchema.parse` in `mergeConfigFile`).
- No new exports — `runSetupWizard` keeps its existing exported signature.

No dedicated automated test for this task (interactive `readline`-based CLI flow; matches existing project convention — `wizard.ts` has no test file today). Verify manually in Step 5 below by piping input into the real CLI.

- [x] **Step 1: Update `databaseChoices` descriptions**

In `src/setup/wizard.ts`, replace lines 68-84:

```ts
const databaseChoices: Choice<DatabaseType>[] = [
  {
    id: 'mssql',
    label: 'Microsoft SQL Server',
    description: 'Paste a connection string.',
  },
  {
    id: 'oracle',
    label: 'Oracle Database',
    description: 'Paste a connection string.',
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    description: 'Paste a connection string.',
  },
];
```

- [x] **Step 2: Add the import**

At the top of `src/setup/wizard.ts`, after the existing `import { appConfigSchema } from '../config/schema.js';` (line 6), add:

```ts
import {
  parseMongoConnectionString,
  parseMssqlConnectionString,
  parseOracleConnectionString,
} from './connection-string-parser.js';
```

- [x] **Step 3: Replace `collectConnections`'s three per-DB blocks**

Replace the whole `collectConnections` function body (lines 153-260) with:

```ts
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
        const connectionString = await promptConnectionString(
          rl,
          'Connection string',
          'Server=host,1433;Database=db;User Id=user;Password=pass;',
          parseMssqlConnectionString,
        );
        const connectionStringEnv = envName(name, 'CONNECTION_STRING');
        output.write(`  → Connection string saved as ${connectionStringEnv} in .env\n`);

        connections[name] = {
          type: 'mssql',
          connectionStringEnv,
          mode: 'readonly',
        };
        envEntries.push({ name: connectionStringEnv, value: connectionString });
      }

      if (database === 'oracle') {
        const name = await promptConnectionName(
          rl,
          defaultConnectionName(database, index),
          connections,
        );
        const parsed = await promptConnectionString(
          rl,
          'Connection string',
          'user/password@host:1521/service_name  (or an ODP.NET "Data Source=...;User Id=...;Password=..." string)',
          parseOracleConnectionString,
        );

        const passwordEnv = envName(name, 'PASSWORD');
        const password = parsed.password ?? (await promptText(rl, 'Password', 'change-me'));
        output.write(`  → Password saved as ${passwordEnv} in .env\n`);

        connections[name] = {
          type: 'oracle',
          connectDescriptor: parsed.connectDescriptor,
          username: parsed.username,
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
        const parsed = await promptConnectionString(
          rl,
          'Connection string',
          'mongodb://user:password@host:27017/database',
          parseMongoConnectionString,
        );
        const uriEnv = envName(name, 'URI');
        output.write(`  → Connection URI saved as ${uriEnv} in .env\n`);

        connections[name] = {
          type: 'mongodb',
          uriEnv,
          database: parsed.database,
          mode: 'readonly',
        };
        envEntries.push({ name: uriEnv, value: parsed.uri });
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

async function promptConnectionString<T>(
  rl: Interface,
  label: string,
  example: string,
  parse: (value: string) => T | null,
): Promise<T> {
  while (true) {
    const raw = await promptRequired(rl, label);
    const parsed = parse(raw);
    if (parsed !== null) {
      return parsed;
    }
    output.write(`Could not parse that connection string. Expected a format like:\n  ${example}\n`);
  }
}
```

- [x] **Step 4: Remove the now-dead `promptInteger` and `buildMongoUri` functions**

`promptInteger` (previously around line 562-571) and `buildMongoUri` (previously around line 707-721) have no remaining call sites after Step 3 — delete both function definitions entirely. Leave `promptRequired`, `promptConnectionName`, `promptBoolean`, and `promptText` untouched (still used).

- [x] **Step 5: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all exit 0. `no-unused-vars` will fail the build if `promptInteger`/`buildMongoUri` weren't fully removed — this is the confirmation they're gone.

- [x] **Step 6: Manual end-to-end smoke test**

Run the wizard against a scratch directory, feeding it the three real example connection strings via stdin, and confirm the generated files look right:

```bash
mkdir -p /tmp/mcp-db-wizard-smoke && cd /tmp/mcp-db-wizard-smoke
printf 'all\nall\nmssql_test\nServer=10.20.30.53,1439;Database=DemoDb;User ID=demo_ms_user;Password=demo_ms_pass1;MultipleActiveResultSets=True;TrustServerCertificate=True;\nn\noracle_test\nData Source=(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=10.20.30.15)(PORT=1521)))(CONNECT_DATA=(SERVER=POOLED)(SERVICE_NAME=DEMOPDB1)));User Id=demo_ora_user;Password=demo_ora_pass1;Validate Connection=true;Max Pool Size=1000\nn\nmongo_test\nmongodb://demo_mongo_user:demo_mongo_pass1@10.20.30.10:27017/demo_billing_db\nn\n' | node /home/phatnv8/Documents/SourceCode/MCP-DB/dist/cli.js setup --project .
cat mcp-db.local.yml
cat .env
cd /home/phatnv8/Documents/SourceCode/MCP-DB && rm -rf /tmp/mcp-db-wizard-smoke
```

Expected in `mcp-db.local.yml`: three connections — `mssql_test` with `connectionStringEnv: MSSQL_TEST_CONNECTION_STRING` (no `host`/`database`/`username`), `oracle_test` with `connectDescriptor: (DESCRIPTION=...)` and `username: demo_ora_user` (no `host`), `mongo_test` with `uriEnv: MONGO_TEST_URI` and `database: demo_billing_db`.
Expected in `.env`: `MSSQL_TEST_CONNECTION_STRING=...`, `ORACLE_TEST_PASSWORD=demo_ora_pass1`, `MONGO_TEST_URI=mongodb://...`.
Run `node /home/phatnv8/Documents/SourceCode/MCP-DB/dist/cli.js validate-config --config mcp-db.local.yml --env .env` (before the `cd`/`rm -rf` cleanup line) and confirm it reports the config as valid — this exercises `appConfigSchema.parse` from Task 2 against real wizard output.

- [x] **Step 7: Commit**

```bash
git add src/setup/wizard.ts
git commit -m "feat(setup): ask for a single connection string instead of 5 fields per DB"
```

---

### Task 5: Docs and final verification

**Files:**
- Modify: `README.md` (Install section wizard description; Config section)
- Modify: `CHANGELOG.md`
- Modify: `docs/domain.md:77-78,86` (module map rows)

- [x] **Step 1: Update `README.md` wizard description**

In the "Run the setup wizard" section, replace:

```
The wizard asks which AI clients and databases to configure, prompts for connection details, and writes all config files automatically.
```

with:

```
The wizard asks which AI clients and databases to configure, then asks for one connection string per database (the same string your DB host, hosting provider, or existing app config already gives you) and writes all config files automatically.
```

- [x] **Step 2: Add a connection-string example to the `Config` section**

In `README.md`, in the `## Config` section, after the existing YAML example block (the one showing `mssql_report`, `mssql_write_model`, `oracle_local`, `mssql_local`, `mongo_local`), add:

```markdown
### Connection strings instead of individual fields

Oracle and MSSQL also accept a raw connection string instead of `host`/`port`/`database`/`username`:

```yaml
connections:
  mssql_from_string:
    type: mssql
    connectionStringEnv: MSSQL_FROM_STRING_CONNECTION_STRING
    mode: readonly

  oracle_from_string:
    type: oracle
    connectDescriptor: (DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=10.20.30.15)(PORT=1521)))(CONNECT_DATA=(SERVER=POOLED)(SERVICE_NAME=DEMOPDB1)))
    username: demo_ora_user
    passwordEnv: ORACLE_FROM_STRING_PASSWORD
    mode: readonly
```

`connectionStringEnv` points to a full ADO/tedious connection string in `.env` (same convention as MongoDB's `uriEnv`). `connectDescriptor` holds an Oracle TNS connect descriptor or Easy Connect string and is not secret — only the password goes in `.env`. The setup wizard generates these automatically from a pasted connection string; both forms can also still be hand-written using the structured `host`/`port`/... fields shown above.
```

- [x] **Step 3: Update `CHANGELOG.md`**

Add a new entry above the most recent released version heading:

```markdown
## Unreleased

- Setup wizard now asks for a single connection string per database connection (MSSQL, Oracle, MongoDB) instead of separate host/port/database/username/password prompts.
- Added `connectionString`/`connectionStringEnv` support to MSSQL connections and `connectDescriptor` support to Oracle connections, so a raw ADO/tedious or TNS connection string can be used directly instead of structured fields.
```

If an `## Unreleased` heading already exists from a previous change, add these two bullets under it instead of creating a duplicate heading.

- [x] **Step 4: Update `docs/domain.md` module map**

Replace line 77:
```
| Oracle connector | `src/connectors/oracle.ts` | HIGH | Pool mgmt, NCHAR→VARCHAR2 auto-cast, CLOB streaming, explain plan |
```
with:
```
| Oracle connector | `src/connectors/oracle.ts` | HIGH | Pool mgmt, NCHAR→VARCHAR2 auto-cast, CLOB streaming, explain plan, raw `connectDescriptor` support |
```

Replace line 78:
```
| MSSQL connector | `src/connectors/mssql.ts` | MEDIUM | Pool mgmt, named-param binds (`@p1`, `@p2`, ...), SHOWPLAN_TEXT explain |
```
with:
```
| MSSQL connector | `src/connectors/mssql.ts` | MEDIUM | Pool mgmt, named-param binds (`@p1`, `@p2`, ...), SHOWPLAN_TEXT explain, raw `connectionString`/`connectionStringEnv` support |
```

Replace line 86:
```
| Setup wizard | `src/setup/wizard.ts` | HIGH | readline prompts, TOML/YAML/JSON config merge, `.gitignore` patch |
```
with:
```
| Setup wizard | `src/setup/wizard.ts` | HIGH | readline prompts (single connection string per DB, see `connection-string-parser.ts`), TOML/YAML/JSON config merge, `.gitignore` patch |
```

- [x] **Step 5: Full verification**

Run: `npm run typecheck && npm run lint && npm run build && npm test`
Expected: all exit 0.

Run: `mcp__gitnexus__detect_changes` with `scope: "all"`, `repo: "MCP-DB"` (per this project's `CLAUDE.md`, required before committing). Confirm the affected symbols/processes are limited to `connection-string-parser.ts`, `schema.ts`, `types.ts`, `oracle.ts`, `mssql.ts`, `wizard.ts`, and docs — no unexpected symbols.

- [x] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md docs/domain.md
git commit -m "docs: document connection-string setup mode"
```

- [x] **Step 7: Re-index**

Run: `npx gitnexus analyze` (per this project's `CLAUDE.md`, keeps the knowledge graph in sync after committing).
