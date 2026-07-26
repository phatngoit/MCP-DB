# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Requires Node.js `>=20.10`.

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
- **`src/tools/register-tools.ts`** — Registers all 14 MCP tools on the `McpServer` (8 shared/SQL tools for Oracle+MSSQL, 6 MongoDB-specific tools). Each tool follows the `runAudited` wrapper: run action → audit → return `ok()` or error.
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

### Coding style

Kebab-case filenames (`load-config.ts`, `register-tools.ts`). Named exports for shared utilities; explicit types at connector and MCP tool boundaries. Prettier enforces single quotes, semicolons, trailing commas, 100-char width.

### Testing

Unit tests are colocated as `*.test.ts` (currently `src/core/security.test.ts`, `src/core/format.test.ts`) and run without a live database. Connector code (`src/connectors/`) has no automated tests — verify DB connectivity changes manually with `test-connections` against the Docker fixtures in `examples/docker-compose.yml` (see `docs/integration-testing.md`).

## Thông tin hiện tại của dự án

@import docs/domain.md

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **MCP-DB** (487 symbols, 1124 relationships, 40 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/MCP-DB/context` | Codebase overview, check index freshness |
| `gitnexus://repo/MCP-DB/clusters` | All functional areas |
| `gitnexus://repo/MCP-DB/processes` | All execution flows |
| `gitnexus://repo/MCP-DB/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
