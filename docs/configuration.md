# Configuration

`mcp-db-connect` uses a YAML file with two top-level sections:

- `security`
- `connections`

Each connection is named. AI tools will use the name when calling MCP tools.

Secrets can be provided directly, but environment variables are recommended through `passwordEnv` or `uriEnv`.

Each connection owns its own network address. MSSQL and Oracle use explicit `host` and `port` fields. MongoDB stores host and port inside the URI referenced by `uriEnv`.

You can define multiple connections for the same database type by giving each one a unique name, such as `mssql_report`, `mssql_billing`, `oracle_ftms`, and `mongo_logs`.

Oracle uses the `oracledb` driver in Thin mode. Oracle Instant Client is not required.

Databases with `NCHAR`/`NVARCHAR2` columns and `NLS_NCHAR_CHARACTERSET = AL16UTF16` are handled automatically: the connector detects the character set error and rewrites the query to cast those columns to `VARCHAR2` on the server side before sending results to the client.

## Project-local Defaults

When you run commands from a project root, the CLI automatically looks for config in this order:

- `mcp-db.local.yml`
- `mcp-db.yml`
- `mcp-db.yaml`

It also automatically loads `.env` from the same project directory. This keeps AI client configs simple:

```bash
mcp-db-connect start
```

`mcp-db-connect setup` runs the interactive wizard, asks which AI clients and DB types to configure, writes real local `.env` values, and updates `.gitignore` with `node_modules/`, local secrets, and generated MCP helper folders.

`mcp-db-connect init` is the non-interactive template command. It creates `mcp-db.local.yml`, `.env.example`, and updates `.gitignore` for local secrets and audit logs.

## Query Output

`db_query`, `db_mongo_find`, and `db_mongo_aggregate` return Markdown tables so fields appear horizontally and values appear in rows underneath:

```text
Rows: 2

| id | name |
| --- | --- |
| 1 | Alice |
| 2 | Bob |
```

If your files are elsewhere, pass explicit paths:

```bash
mcp-db-connect start --project D:/path/to/project
mcp-db-connect start --config ./config/mcp-db.yml --env ./config/.env
```

## Allowlist and Denylist

```yaml
connections:
  mssql_reporting:
    type: mssql
    host: localhost
    port: 1433
    database: reporting
    username: report_reader
    passwordEnv: MSSQL_PASSWORD
    mode: readonly
    allowSchemas:
      - dbo
    allowTables:
      - customers
      - orders
```

## Limits

Connection-level limits override global defaults:

```yaml
security:
  defaultMaxRows: 100

connections:
  mongo_analytics:
    type: mongodb
    uriEnv: MONGODB_URI
    database: analytics
    maxRows: 50
```

## Local Secrets

Keep real credentials in `.env` and reference them from YAML:

```dotenv
MSSQL_PASSWORD=...
ORACLE_PASSWORD=...
MONGODB_URI=...
```

Never commit `.env` or local config files containing production endpoints.
