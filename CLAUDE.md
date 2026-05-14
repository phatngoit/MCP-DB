# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript → dist/ (uses tsconfig.build.json)
npm run dev          # Run CLI directly via tsx (no compile step)
npm run typecheck    # Type-check without emitting (uses tsconfig.json)
npm run lint         # ESLint on src/**/*.ts
npm run format       # Prettier on all TS/MD/JSON/YAML files
npm test             # Run Vitest test suite
vitest run --reporter=verbose  # Run tests with full output
```

To run a single test file:
```bash
npx vitest run src/core/security.test.ts
```

For local development testing of CLI commands (no global install needed):
```bash
node dist/cli.js start
node dist/cli.js validate-config
node dist/cli.js test-connections
```

Or using tsx without a build step:
```bash
npm run dev -- start
npm run dev -- validate-config
```

## Architecture

This is an ESM-only TypeScript package (`"type": "module"`). Imports must use `.js` extensions even for `.ts` source files (NodeNext module resolution).

### Request flow

```
CLI (src/cli.ts)
  → loadConfig (src/config/load-config.ts) parses YAML + Zod validation
  → startStdioServer / startHttpServer (src/server.ts)
      → ConnectorRegistry (src/core/registry.ts) creates connector instances
      → registerDbTools (src/tools/register-tools.ts) wires MCP tools to registry
           → security.ts: validateSqlQuery / validateMongoPipeline / assertAllowedObject
           → audit.ts: writes JSONL audit log if configured
           → format.ts: formats QueryResult as markdown table
```

### Key layers

- **`src/config/`** — YAML loading (`load-config.ts`) and Zod schema (`schema.ts`). Config defaults are defined in `schema.ts` (e.g., `defaultMaxRows: 100`, `queryTimeoutMs: 10000`).
- **`src/types.ts`** — All shared interfaces: `DbConnector`, `AppConfig`, `SecurityConfig`, connection configs per DB type.
- **`src/core/`** — Cross-cutting concerns: `registry.ts` (connector lifecycle), `security.ts` (SQL/MongoDB validation, masking, allowlists), `audit.ts` (JSONL append), `format.ts` (markdown table output), `errors.ts` (`UserInputError`/`PermissionError`).
- **`src/connectors/`** — One file per DB type (`oracle.ts`, `mssql.ts`, `mongodb.ts`). Each implements the `DbConnector` interface from `types.ts`; `mongodb.ts` additionally implements `MongoDbConnector`.
- **`src/tools/register-tools.ts`** — Registers all 9 MCP tools on the `McpServer`. Each tool follows the `runAudited` wrapper: run action → audit → return `ok()` or error.
- **`src/setup/wizard.ts`** — Interactive setup wizard; generates `.mcp.json`, `.codex/config.toml`, `.gemini/settings.json`, `.kimi/mcp.json`, `mcp-db.local.yml`, `.env`, `.gitignore`.

### Security model

`security.ts` enforces four independent layers at query time:
1. **Readonly check**: queries must start with `SELECT`/`WITH`/`EXPLAIN`; write/DDL keywords rejected unless `allowWriteOperations: true` and `mode: readwrite`.
2. **Multi-statement block**: semicolons mid-query rejected when `blockMultiStatement: true`.
3. **Object allowlist/denylist**: schema and table names filtered per connection config.
4. **Field masking**: `maskResult` recursively redacts keys matching `maskColumns` config or the built-in `SENSITIVE_KEY_PATTERN` regex.

### Transport modes

- **stdio** (`startStdioServer`): single `McpServer` + `StdioServerTransport`; used by AI CLIs.
- **HTTP** (`startHttpServer`): new `McpServer` per request using `StreamableHTTPServerTransport`; `createMcpExpressApp` handles host/CORS validation; optional Bearer/`x-api-key` auth.

### Config discovery

Config file lookup order at startup: `mcp-db.local.yml` → `mcp-db.yml` → `mcp-db.yaml` (relative to `--project` directory). Passwords must be in environment variables (`passwordEnv`), never hardcoded in YAML.

## Thông tin hiện tại của dự án

@import docs/domain.md
