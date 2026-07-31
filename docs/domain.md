# Domain Knowledge — mcp-db-connect

## 1. Tổng Quan Dự Án

| | |
|---|---|
| **Package** | `mcp-db-connect` v0.1.12 (npm public) |
| **Mục đích** | Universal MCP server — cho phép AI tools (Claude, Codex, Gemini, Kimi) query database qua Model Context Protocol |
| **Runtime** | Node.js >=20.10, TypeScript 5.7, ES2022 NodeNext modules |
| **Databases** | Oracle (oracledb ^6.7.2), MSSQL (mssql ^11.0.1), PostgreSQL (pg ^8.22.0), MySQL/MariaDB (mysql2 ^3.23.2), MongoDB (mongodb ^6.12.0) |
| **Transport** | stdio (default) + Streamable HTTP (Express) |
| **Security model** | Readonly-first, SQL regex validation, field masking, JSONL audit log |
| **Quy mô** | ~9 source files chính, 9 MCP tools, 7 CLI commands, 2 HTTP endpoints |
| **CI/CD** | GitHub Actions → npmjs.org khi release |

---

## 2. Domain Terminology

| Term | Viết tắt / Alias | Nghĩa |
|---|---|---|
| Model Context Protocol | MCP | Giao thức chuẩn để AI tools gọi external functions/tools |
| Connector | — | Class implement `DbConnector` interface, wraps một DB driver |
| ConnectorRegistry | Registry | Factory + lifecycle manager, giữ `Map<name, DbConnector>` |
| Transport | — | Cơ chế truyền thông MCP: `stdio` hoặc `StreamableHTTP` |
| Tool | MCP Tool | Function AI có thể gọi qua MCP protocol (vd: `db_query`) |
| Audit | Audit Log | JSONL file ghi mọi tool call: connection, operation, success/fail |
| maskColumns | — | Danh sách tên column bị thay bằng `[masked]` trong kết quả |
| allowSchemas / denySchemas | Allowlist / Denylist | Whitelist/blacklist schema names cho mỗi connection |
| allowTables / denyTables | — | Whitelist/blacklist table/collection names |
| readonly mode | — | Connector chỉ cho SELECT/WITH/EXPLAIN, block write keywords |
| readwrite mode | — | Connector cho phép write operations (`allowWriteOperations: true`) |
| maxRows | — | Giới hạn rows trả về: `min(requested, connection.maxRows, security.defaultMaxRows)` |
| queryTimeoutMs | — | Timeout mỗi query, default 10000ms |
| thin mode | Oracle thin | Oracle driver không cần Instant Client cài sẵn |
| thick mode | Oracle thick | Oracle driver cần Instant Client (C library) |
| runAudited | — | Decorator function bọc tool handler, tự động ghi audit log |
| passwordEnv / uriEnv | — | Tên env var chứa credential, thay vì lưu plaintext trong YAML |

---

## 3. Backend Systems (Database Connections)

| DB System | Driver | Default Port | Auth Fields | Connection Pool |
|---|---|---|---|---|
| Oracle | `oracledb` ^6.7.2 | 1521 | `username` + `passwordEnv` (hoặc `password`) | `createPool` min:0 max:4 |
| MSSQL | `mssql` ^11.0.1 | 1433 | `username` + `passwordEnv` (hoặc `password`), hoặc `connectionStringEnv` | `ConnectionPool` min:0 max:4 |
| PostgreSQL | `pg` ^8.22.0 | 5432 | `username` + `passwordEnv` (hoặc `password`), hoặc `connectionStringEnv` | `Pool` max:4 |
| MySQL/MariaDB | `mysql2` ^3.23.2 | 3306 | `username` + `passwordEnv` (hoặc `password`), hoặc `connectionStringEnv` | `Pool` connectionLimit:4 |
| MongoDB | `mongodb` ^6.12.0 | 27017 | `uriEnv` (hoặc `uri`) | MongoClient internal pool |

**Config file hierarchy** (không commit):
```
mcp-db.yml           ← global config
mcp-db.local.yml     ← local override (tạo bởi wizard)
.env                 ← credentials
```

**AI Client integrations** (consumers, không phải dependencies):

| Client | Config file | Transport |
|---|---|---|
| Claude Code | `.mcp.json` | stdio |
| Codex CLI | `.codex/config.toml` | stdio |
| Gemini CLI | `.gemini/settings.json` | stdio |
| Kimi CLI | `.kimi/mcp.json` | stdio |

---

## 4. Module Map

| Module | Đường dẫn | Độ phức tạp | Vai trò |
|---|---|---|---|
| CLI entry | `src/cli.ts` | LOW | Commander.js commands, parse args, khởi động server |
| MCP server factory | `src/server.ts` | MEDIUM | stdio + HTTP transport, Express app, auth middleware |
| Type definitions | `src/types.ts` | LOW | Tất cả interfaces & discriminated unions |
| Config loader | `src/config/load-config.ts` | LOW | YAML parse, `readSecret()` helper (env var lookup) |
| Config schema | `src/config/schema.ts` | LOW | Zod schemas cho AppConfig, SecurityConfig, connection types |
| Oracle connector | `src/connectors/oracle.ts` | HIGH | Pool mgmt, NCHAR→VARCHAR2 auto-cast, CLOB streaming, explain plan, raw `connectDescriptor` support |
| MSSQL connector | `src/connectors/mssql.ts` | MEDIUM | Pool mgmt, named-param binds (`@p1`, `@p2`, ...), SHOWPLAN_TEXT explain, raw `connectionString`/`connectionStringEnv` support |
| PostgreSQL connector | `src/connectors/postgres.ts` | MEDIUM | Pool mgmt, native `$1`/`$2` positional binds, `EXPLAIN (FORMAT JSON)`, raw `connectionString`/`connectionStringEnv` support |
| MySQL/MariaDB connector | `src/connectors/mysql.ts` | MEDIUM | Pool mgmt, native `?` positional binds, `EXPLAIN FORMAT=JSON`, raw `connectionString`/`connectionStringEnv` support |
| MongoDB connector | `src/connectors/mongodb.ts` | MEDIUM | find/aggregate, schema infer (sample 20 docs) |
| Connector registry | `src/core/registry.ts` | MEDIUM | Factory switch, lazy init, `Map<name, DbConnector>` lifecycle |
| Security guards | `src/core/security.ts` | MEDIUM | validateSqlQuery, assertAllowedObject, maskResult, resolveLimit |
| Audit writer | `src/core/audit.ts` | LOW | `fs.appendFile` JSONL, không có rotation |
| Error classes | `src/core/errors.ts` | LOW | `UserInputError`, `PermissionError` |
| Result formatter | `src/core/format.ts` | LOW | Render Markdown table từ `QueryResult` |
| MCP tool registrations | `src/tools/register-tools.ts` | HIGH | 9 tools, mỗi tool gọi security + connector + audit + format |
| Setup wizard | `src/setup/wizard.ts` | HIGH | readline prompts (single connection string per DB, see `connection-string-parser.ts`), TOML/YAML/JSON config merge, `.gitignore` patch |

**Quy tắc thêm feature mới:**
- Connector mới → tạo `src/connectors/<db>.ts`, thêm case vào `registry.ts`, schema vào `schema.ts`, type vào `types.ts`, prompt vào `wizard.ts`
- MCP tool mới → thêm `server.tool(...)` trong `register-tools.ts`, bọc trong `runAudited()`
- CLI command mới → thêm `program.command(...)` trong `cli.ts`

---

## 5. Legacy Analysis Files

@import docs/legacy/01-overview.md
— Tech stack đầy đủ (versions), entry points chính, CI/CD pipeline.

@import docs/legacy/02-architecture.md
— Cấu trúc thư mục `src/`, luồng thực thi từ CLI → MCP tools, 2 transport modes, 5 design patterns.

@import docs/legacy/03-business-flows.md
— 5 flows chi tiết: setup wizard, `db_query`, `db_mongo_find`, `db_explain_query`, `db_mongo_aggregate`.

@import docs/legacy/04-api-inventory.md
— 9 MCP tools (params, output, notes), 2 HTTP endpoints, 7 CLI commands.

@import docs/legacy/05-data-model.md
— AppConfig Zod schema, 3 connection configs (Oracle/MSSQL/MongoDB), QueryResult, AuditEvent, TableDescription.

@import docs/legacy/06-integrations.md
— DB drivers với pooling details, MCP SDK classes, AI client config files, Docker compose setup.

@import docs/legacy/07-risk-register.md
— 11 risks (1 HIGH: credentials in YAML, 5 MEDIUM: SQL injection/no rate limit/no timeout, 5 LOW). Mỗi risk có source location và khuyến nghị.

@import docs/legacy/08-modernization-roadmap.md
— 4-phase roadmap (bug fixes → security → observability → feature expansion) + step-by-step guide thêm connector/tool/command mới.
