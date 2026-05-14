# MCP DB Connect

[![npm version](https://img.shields.io/npm/v/mcp-db-connect.svg)](https://www.npmjs.com/package/mcp-db-connect)
[![CI](https://github.com/phatngoit/MCP-DB/actions/workflows/ci.yml/badge.svg)](https://github.com/phatngoit/MCP-DB/actions/workflows/ci.yml)

Universal MCP server for readonly-first access to Oracle Database, Microsoft SQL Server, and MongoDB.

This project is designed for AI tools that support the Model Context Protocol. Projects can install it, provide a YAML config, and expose safe database tools to their AI client.

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

Install in the project where your AI tool will run:

```bash
npm install --save-dev mcp-db-connect
npx mcp-db-connect setup
```

Or install globally:

```bash
npm install -g mcp-db-connect
mcp-db-connect setup
```

You can also install directly from GitHub when testing unreleased changes:

```bash
npm install -g github:phatngoit/MCP-DB
```

### Interactive Setup

The recommended setup command is:

```bash
mcp-db-connect setup
```

The wizard asks:

- Which AI clients to configure: Claude Code, Codex CLI, Gemini CLI, Kimi CLI, or generic MCP JSON.
- Which databases to configure: Oracle, Microsoft SQL Server, MongoDB.
- Connection details for each selected database: IP/host, port, database/service name, username, and password.

Each selected database connection asks for its own port. For example, MSSQL can use `1433`, Oracle can use `1521`, and MongoDB can use `27017`, but these are only defaults; enter the real port for each DB during setup.

One project can contain any number of named connections. For example, the same project can use two MSSQL connections, two Oracle connections, and two MongoDB connections. During setup, answer `y` when asked `Add another ... connection`.

It creates or updates these project-local files:

```text
mcp-db.local.yml       # database connection config
.env                   # local secrets
.gitignore             # ignores node_modules/, .env, mcp-db.local.yml, logs/, .mcp-tools/
.mcp.json              # Claude Code project MCP config when selected
.codex/config.toml     # Codex CLI project config when selected
.gemini/settings.json  # Gemini CLI project config when selected
.kimi/mcp.json         # Kimi CLI ad-hoc MCP config when selected
```

Use non-interactive AI/DB selection when you already know the targets:

```bash
mcp-db-connect setup --ai claude,codex,gemini,kimi --db mssql,mongodb
```

Overwrite existing generated entries:

```bash
mcp-db-connect setup --force
```

For local development:

```bash
npm install
npm run build
node dist/cli.js init
node dist/cli.js validate-config
```

## Quick Start

Run the setup wizard from your application project root:

```bash
mcp-db-connect setup
```

Then test configured databases:

```bash
mcp-db-connect test-connections
```

Start the MCP server manually if you want to test stdio startup:

```bash
mcp-db-connect start
```

Print AI client setup snippets:

```bash
mcp-db-connect ai-config
```

`init` is still available when you only want template files and no wizard:

```bash
mcp-db-connect init
```

This creates `mcp-db.local.yml`, `.env.example`, and updates `.gitignore` with `node_modules/`, `.env`, `mcp-db.local.yml`, and `logs/`.

Start a Streamable HTTP MCP endpoint:

```bash
mcp-db-connect serve-http --host 127.0.0.1 --port 3000 --path /mcp
```

Require an API key for HTTP MCP requests:

```bash
mcp-db-connect serve-http --api-key-env MCP_DB_HTTP_API_KEY
```

## AI Client Examples

All examples assume the AI CLI is started from your application project root.

### Claude Code CLI

Recommended automatic setup:

```bash
mcp-db-connect setup --ai claude --db mssql
```

Manual setup with Claude Code:

```bash
claude mcp add --transport stdio db-connect --scope local -- mcp-db-connect start --project . --config ./mcp-db.local.yml --env ./.env
```

Project `.mcp.json` shape:

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
      "command": "mcp-db-connect",
      "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
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
      "command": "mcp-db-connect",
      "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
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
      "command": "mcp-db-connect",
      "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"],
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

## Tools

- `db_list_connections`
- `db_test_connection`
- `db_list_schemas`
- `db_list_tables`
- `db_describe_table`
- `db_query`
- `db_explain_query`
- `db_mongo_find`
- `db_mongo_aggregate`

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

- More schema sampling for MongoDB
- OpenTelemetry tracing
- Secrets manager integrations
