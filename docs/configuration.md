# Configuration

`mcp-db-connect` uses a YAML file with two top-level sections:

- `security`
- `connections`

Each connection is named. AI tools will use the name when calling MCP tools.

Secrets can be provided directly, but environment variables are recommended through `passwordEnv` or `uriEnv`.

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
