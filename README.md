# MCP DB Connect

[![npm version](https://img.shields.io/npm/v/mcp-db-connect.svg)](https://www.npmjs.com/package/mcp-db-connect)
[![CI](https://github.com/phatngoit/MCP-DB/actions/workflows/ci.yml/badge.svg)](https://github.com/phatngoit/MCP-DB/actions/workflows/ci.yml)

Universal MCP server for readonly-first access to Oracle Database, Microsoft SQL Server, and MongoDB.

This project is designed for AI tools that support the Model Context Protocol. Projects can install it, provide a YAML config, and expose safe database tools to their AI client.

Oracle connections use the Node.js `oracledb` Thin mode by default, so Oracle Instant Client is not required for most databases. Some Oracle databases use NCHAR character sets that Thin mode cannot handle; those databases require Oracle Thick mode with Oracle Client libraries.

By default, commands run from a project directory automatically use:

- `mcp-db.local.yml`, then `mcp-db.yml`, then `mcp-db.yaml`
- `.env`

## Features

- Oracle, MSSQL, and MongoDB connectors
- Multiple named connections in one config file
- Readonly by default
- SQL multi-statement blocking
- MongoDB `$out` and `$merge` blocking in readonly mode
- Row limits and query timeouts
- Markdown table output for query results
- Schema/table allowlist and denylist
- Sensitive field masking
- JSONL audit logs
- Interactive setup wizard for AI clients and database connections
- CLI for setup, init, validation, connection testing, and stdio/HTTP server startup

## Install

**1. Install the package**

Node / TypeScript projects (local install):

```bash
npm install --save-dev mcp-db-connect
```

.NET, Python, or other non-Node projects (global install):

```bash
npm install -g mcp-db-connect
```

**2. Run the setup wizard**

```bash
npx mcp-db-connect setup
```

The wizard asks which AI clients and databases to configure, prompts for connection details, and writes all config files automatically.

**3. Test your connections**

```bash
npx mcp-db-connect test-connections
```

That's it — your AI client is now connected to your databases.

### What the wizard creates

```text
mcp-db.local.yml       # database connection config
.env                   # local secrets
.gitignore             # keeps secrets and local config out of git
.mcp.json              # Claude Code MCP config (if selected)
.codex/config.toml     # Codex CLI config (if selected)
.gemini/settings.json  # Gemini CLI config (if selected)
.kimi/mcp.json         # Kimi CLI config (if selected)
```

### Other setup options

Skip the wizard with explicit flags:

```bash
npx mcp-db-connect setup --ai claude,codex --db mssql,mongodb
```

Overwrite existing config entries:

```bash
npx mcp-db-connect setup --force
```

Start an HTTP MCP endpoint instead of stdio:

```bash
npx mcp-db-connect serve-http --host 127.0.0.1 --port 3000
npx mcp-db-connect serve-http --api-key-env MCP_DB_HTTP_API_KEY
```

## AI Client Examples

All examples assume the AI CLI is started from your application project root.

### Claude Code CLI

Recommended automatic setup:

```bash
mcp-db-connect setup --ai claude --db mssql
```

The generated `.mcp.json` uses `npx` so it works whether the package is installed globally or locally.

#### Global install (`npm install -g mcp-db-connect`)

`mcp-db-connect` is in PATH and can be used directly:

```bash
claude mcp add --transport stdio db-connect --scope local -- mcp-db-connect start --project . --config ./mcp-db.local.yml --env ./.env
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
      "env": {
        "LOG_LEVEL": "silent"
      }
    }
  }
}
```

#### Local install (`npm install --save-dev mcp-db-connect`)

Use `npx` so Claude Code can find the binary inside `node_modules/.bin`:

```bash
claude mcp add --transport stdio db-connect --scope local -- npx mcp-db-connect start --project . --config ./mcp-db.local.yml --env ./.env
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "npx",
      "args": ["mcp-db-connect", "start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
      "env": {
        "LOG_LEVEL": "silent"
      }
    }
  }
}
```

### Codex CLI

Recommended automatic setup:

```bash
mcp-db-connect setup --ai codex --db mssql,oracle,mongodb
npm --prefix .\.mcp-tools\db-connect install
codex
```

Project `.codex/config.toml`:

```toml
[mcp_servers.db-connect]
command = '.\.mcp-tools\db-connect\node_modules\.bin\mcp-db-connect.cmd'
args = ["start", "--project", ".", "--config", '.\mcp-db.local.yml', "--env", '.\.env']
enabled = true

[mcp_servers.db-connect.env]
LOG_LEVEL = "silent"
```

The `.mcp-tools/db-connect/package.json` file created by the wizard uses `mcp-db-connect` from npm. Run the install command above once per project.

### Gemini CLI

Recommended automatic setup:

```bash
mcp-db-connect setup --ai gemini --db mongodb
gemini
```

Project `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "npx",
      "args": ["mcp-db-connect", "start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
      "env": {
        "LOG_LEVEL": "silent"
      }
    }
  }
}
```

### Kimi CLI

Recommended automatic setup:

```bash
mcp-db-connect setup --ai kimi --db oracle
kimi --mcp-config-file .\.kimi\mcp.json
```

Project `.kimi/mcp.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "npx",
      "args": ["mcp-db-connect", "start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
      "env": {
        "LOG_LEVEL": "silent"
      }
    }
  }
}
```

Kimi CLI can also manage global MCP servers with `kimi mcp add`, but the project-local file above keeps this database MCP scoped to one project.

### Generic MCP JSON

For clients that accept the common MCP JSON format:

```bash
mcp-db-connect setup --ai generic --db mssql
```

Use `.mcp-db-connect/mcp.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "npx",
      "args": ["mcp-db-connect", "start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
      "env": {
        "LOG_LEVEL": "silent"
      }
    }
  }
}
```

## Streamable HTTP Client

Use this endpoint for MCP clients or agents that support Streamable HTTP:

```text
http://127.0.0.1:3000/mcp
```

Health check:

```text
http://127.0.0.1:3000/healthz
```

## Config

```yaml
security:
  defaultMaxRows: 100
  queryTimeoutMs: 10000
  blockMultiStatement: true
  allowWriteOperations: false
  maskColumns:
    - password
    - token
    - secret
    - api_key
  auditLogPath: ./logs/mcp-db-connect.audit.jsonl

connections:
  mssql_report:
    type: mssql
    host: 172.27.62.7
    port: 1433
    database: Internet
    username: report_reader
    passwordEnv: MSSQL_REPORT_PASSWORD
    encrypt: true
    trustServerCertificate: true
    mode: readonly

  mssql_write_model:
    type: mssql
    host: 172.27.62.8
    port: 1444
    database: InternetWrite
    username: writer_user
    passwordEnv: MSSQL_WRITE_PASSWORD
    encrypt: true
    trustServerCertificate: true
    mode: readonly

  oracle_local:
    type: oracle
    host: localhost
    port: 1521
    serviceName: ORCLPDB1
    username: app_readonly
    passwordEnv: ORACLE_PASSWORD
    clientMode: thin
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
```

MongoDB stores the selected port inside the URI saved in `.env`, for example:

```dotenv
MONGODB_URI=mongodb://user:password@localhost:27018/appdb
```

### Oracle Thin vs Thick Mode

Default Oracle setup uses `clientMode: thin` and does not need Oracle Instant Client:

```yaml
connections:
  oracle_local:
    type: oracle
    host: localhost
    port: 1521
    serviceName: ORCLPDB1
    username: app_readonly
    passwordEnv: ORACLE_PASSWORD
    clientMode: thin
```

Oracle Instant Client is not required. If the database has `NCHAR`/`NVARCHAR2` columns with `NLS_NCHAR_CHARACTERSET = AL16UTF16`, the connector automatically rewrites the query to cast those columns to `VARCHAR2` server-side so Thin mode can handle them.

## Tools

### SQL (Oracle + MSSQL)

- `db_list_connections` — List configured connections
- `db_test_connection` — Test a connection
- `db_list_schemas` — List schemas
- `db_list_tables` — List tables
- `db_describe_table` — Describe columns, primary keys, foreign keys, and indexes
- `db_query` — Run a readonly SQL query
- `db_explain_query` — Return an execution plan for a SQL query
- `db_count` — Count rows in a table with an optional WHERE clause

`db_query` and `db_explain_query` accept an optional `params` array for bind parameters. Oracle uses positional binds (`:1`, `:2`, ...); MSSQL has no positional syntax, so params are bound as named parameters `@p1`, `@p2`, ... in the same order as the array.

### MongoDB

- `db_list_connections` — List configured connections
- `db_test_connection` — Test a connection
- `db_list_schemas` — List databases
- `db_list_tables` — List collections
- `db_describe_table` — Sample collection fields
- `db_mongo_find` — Run a readonly find operation
- `db_mongo_aggregate` — Run a readonly aggregate pipeline
- `db_mongo_count` — Count documents with an optional filter
- `db_mongo_get_indexes` — List indexes for a collection
- `db_mongo_explain_find` — Return an execution plan for a find operation
- `db_mongo_explain_aggregate` — Return an execution plan for an aggregate pipeline

Query result tools return tables like:

```text
Rows: 2

| id | name |
| --- | --- |
| 1 | Alice |
| 2 | Bob |
```

## CLI Commands

- `mcp-db-connect setup`
- `mcp-db-connect init`
- `mcp-db-connect ai-config`
- `mcp-db-connect validate-config`
- `mcp-db-connect test-connections`
- `mcp-db-connect start`
- `mcp-db-connect serve-http --host 127.0.0.1 --port 3000`
- `mcp-db-connect serve-http --api-key-env MCP_DB_HTTP_API_KEY`

## Security Defaults

The server is intentionally conservative:

- Connections default to `readonly`
- SQL write and DDL keywords are blocked unless global and connection config allow writes
- SQL multi-statement execution is blocked
- MongoDB aggregate write stages are blocked
- Result rows are capped by config
- Sensitive fields are masked recursively

Use database accounts with the smallest permissions possible. The MCP layer is a guardrail, not a replacement for DB-level permissions.

## Roadmap

- PostgreSQL connector
- MySQL / MariaDB connector
- Configurable sample size for MongoDB `db_describe_table` (currently 20 documents)
- OpenTelemetry tracing
- Secrets manager integrations (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault)
