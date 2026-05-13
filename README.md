# MCP DB Connect

[![npm version](https://img.shields.io/npm/v/mcp-db-connect.svg)](https://www.npmjs.com/package/mcp-db-connect)
[![CI](https://github.com/phatngoit/MCP-DB/actions/workflows/ci.yml/badge.svg)](https://github.com/phatngoit/MCP-DB/actions/workflows/ci.yml)

Universal MCP server for readonly-first access to Oracle Database, Microsoft SQL Server, and MongoDB.

This project is designed for AI tools that support the Model Context Protocol. Projects can install it, provide a YAML config, and expose safe database tools to their AI client.

## Features

- Oracle, MSSQL, and MongoDB connectors
- Multiple named connections in one config file
- Readonly by default
- SQL multi-statement blocking
- MongoDB `$out` and `$merge` blocking in readonly mode
- Row limits and query timeouts
- Schema/table allowlist and denylist
- Sensitive field masking
- JSONL audit logs
- CLI for init, validation, and stdio server startup

## Install

```bash
npm install -g mcp-db-connect
```

Or run without global install:

```bash
npx mcp-db-connect start --config ./mcp-db.yml
```

You can also install directly from GitHub when testing unreleased changes:

```bash
npm install -g github:phatngoit/MCP-DB
```

For local development:

```bash
npm install
npm run build
node dist/cli.js init
node dist/cli.js validate-config --config ./mcp-db.yml
```

## Quick Start

Create config:

```bash
mcp-db-connect init --output ./mcp-db.yml
```

Start server:

```bash
mcp-db-connect start --config ./mcp-db.yml
```

Test configured databases:

```bash
mcp-db-connect test-connections --config ./mcp-db.yml
```

Start a Streamable HTTP MCP endpoint:

```bash
mcp-db-connect serve-http --config ./mcp-db.yml --host 127.0.0.1 --port 3000 --path /mcp
```

Require an API key for HTTP MCP requests:

```bash
mcp-db-connect serve-http --config ./mcp-db.yml --api-key-env MCP_DB_HTTP_API_KEY
```

## Claude Desktop Example

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--config", "C:/absolute/path/mcp-db.yml"],
      "env": {
        "ORACLE_PASSWORD": "change-me",
        "MSSQL_PASSWORD": "change-me",
        "MONGODB_URI": "mongodb://localhost:27017"
      }
    }
  }
}
```

## Cursor / VS Code MCP Example

Use the same command and args:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--config", "/absolute/path/mcp-db.yml"]
    }
  }
}
```

## Streamable HTTP Client Example

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

## CLI Commands

- `mcp-db-connect init`
- `mcp-db-connect validate-config --config ./mcp-db.yml`
- `mcp-db-connect test-connections --config ./mcp-db.yml`
- `mcp-db-connect start --config ./mcp-db.yml`
- `mcp-db-connect serve-http --config ./mcp-db.yml --host 127.0.0.1 --port 3000`
- `mcp-db-connect serve-http --config ./mcp-db.yml --api-key-env MCP_DB_HTTP_API_KEY`

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
