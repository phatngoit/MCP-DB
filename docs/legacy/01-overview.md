# Project Overview & Tech Stack

**Package:** `mcp-db-connect` | **Version:** 0.1.12 | **License:** MIT
**Author:** phatngoit | **NPM:** https://www.npmjs.com/package/mcp-db-connect

## Description

Universal MCP (Model Context Protocol) server cung cấp giao diện readonly-first để AI tools (Claude Code, Codex, Gemini, Kimi) có thể query các database Oracle, MSSQL, MongoDB thông qua protocol chuẩn.

## Tech Stack

| Component | Technology | Version |
|---|---|---|
| Runtime | Node.js | >=20.10 (Docker: 22-slim) |
| Language | TypeScript | ^5.7.2, ES2022, NodeNext modules |
| CLI framework | Commander.js | ^12.1.0 |
| Config parsing | YAML + Zod | yaml ^2.6.1, zod ^3.24.1 |
| Oracle driver | oracledb | ^6.7.2 |
| MSSQL driver | mssql | ^11.0.1 |
| MongoDB driver | mongodb | ^6.12.0 |
| MCP SDK | @modelcontextprotocol/sdk | ^1.0.0 |
| Logging | pino | ^9.5.0 |
| Env loading | dotenv | ^16.4.7 |
| Test runner | vitest | ^4.1.6 |
| Linter | eslint + @typescript-eslint | ^9.17.0 |
| Formatter | prettier | ^3.4.2 |
| Dev runner | tsx | ^4.19.2 |

## CI/CD

GitHub Actions — build trên ubuntu-latest, publish lên npmjs.org khi release.

## Key Entry Points

| File | Role |
|---|---|
| `src/cli.ts` | CLI commands (Commander.js) |
| `src/server.ts` | MCP server factory: stdio + HTTP transports |
| `src/types.ts` | All TypeScript interfaces & type unions |
| `src/config/schema.ts` | Zod validation schemas |
| `src/core/registry.ts` | ConnectorRegistry: factory + lifecycle manager |
| `src/core/security.ts` | validateSqlQuery, validateMongoPipeline, maskResult, etc. |
| `src/tools/register-tools.ts` | All MCP tool registrations |
| `src/setup/wizard.ts` | Interactive setup wizard |
