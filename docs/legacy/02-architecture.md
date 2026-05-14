# Architecture

## Directory Structure

```
src/
  cli.ts                    # Entry point: CLI commands (Commander.js)
  server.ts                 # MCP server factory: stdio + HTTP transports
  types.ts                  # All TypeScript interfaces & type unions
  config/
    schema.ts               # Zod validation schemas
    load-config.ts          # YAML file loader + readSecret() helper
  connectors/
    oracle.ts               # OracleConnector (implements DbConnector)
    mssql.ts                # MssqlConnector (implements DbConnector)
    mongodb.ts              # MongodbConnector (implements MongoDbConnector)
  core/
    registry.ts             # ConnectorRegistry: factory + lifecycle manager
    security.ts             # validateSqlQuery, validateMongoPipeline, maskResult, resolveLimit, assertAllowedObject
    audit.ts                # JSONL append-only audit log writer
    errors.ts               # UserInputError, PermissionError (custom error classes)
    format.ts               # Markdown table renderer for query results
    format.test.ts          # Vitest unit tests
    security.test.ts        # Vitest unit tests
  setup/
    wizard.ts               # Interactive setup wizard (readline/promises)
  types/
    vendor.d.ts             # Type augmentation for oracledb + mssql (skipLibCheck workaround)
```

## Main Execution Flow

```
CLI (cli.ts)
  -> loadConfig (config/load-config.ts)  [YAML -> Zod parse -> AppConfig]
  -> loadEnv (dotenv)
  -> startStdioServer / startHttpServer (server.ts)
       -> ConnectorRegistry (core/registry.ts)  [Map<name, DbConnector>]
       -> McpServer (@modelcontextprotocol/sdk)
       -> registerDbTools (tools/register-tools.ts)
            -> security checks (core/security.ts)
            -> connector.query / .find / .aggregate (connectors/*)
            -> audit() (core/audit.ts)
            -> formatQueryResult() (core/format.ts)
            -> ok() -> MCP text content response
```

## Transport Modes

1. **Stdio** (`mcp-db-connect start`): process stdin/stdout — AI client fork process này
2. **Streamable HTTP** (`mcp-db-connect serve-http`): Express-based, POST `/mcp`, GET `/healthz`, Bearer/X-API-Key auth

## Design Patterns

| Pattern | Where used |
|---|---|
| Factory | `ConnectorRegistry.createConnector()` switch on `config.type` |
| Interface segregation | `DbConnector` (base) vs `MongoDbConnector` (extends với `find`, `aggregate`) |
| Lazy initialization | Pool/Client chỉ tạo khi method đầu tiên được gọi |
| Decorator | `runAudited()` wrapper bọc tất cả tool handlers |
| Discriminated union | `DbConnectionConfig = OracleConnectionConfig \| MssqlConnectionConfig \| MongoConnectionConfig` |
