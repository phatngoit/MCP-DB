# Modernization Roadmap

## Phase 1 — Bug Fixes (Ưu tiên cao, làm trước khi thêm feature)

1. **Fix `MssqlConnector.query()`** — bind `input.params` đúng cách (bug hiện tại, risk R2)
2. **Đồng bộ hardcoded server version** trong `server.ts` với `package.json` (risk R9)
3. **MSSQL `TOP N` injection** — tránh full-scan trước khi slice (risk R3)

## Phase 2 — Security Hardening

4. Chuyển từ regex-based SQL validation sang AST parser (`node-sql-parser`) (risk R1)
5. Warn hoặc block khi `password` field được dùng trực tiếp trong config YAML (risk R5)
6. Thêm rate limiting cho HTTP mode (risk R10)
7. Thêm request timeout cho HTTP server (risk R7)

## Phase 3 — Observability

8. Thay thế append-file audit log bằng structured logging với rotation (pino file transport) (risk R6)
9. Thêm OpenTelemetry tracing (đã có trong roadmap của project)
10. Health endpoint mở rộng với per-connection status

## Phase 4 — Feature Expansion

11. MongoDB schema sampling nâng cao (`$sample` aggregation) (risk R8)
12. Secrets manager integrations: AWS Secrets Manager, Azure Key Vault, HashiCorp Vault
13. **PostgreSQL connector** — pattern đã có sẵn, chỉ cần implement `DbConnector` interface
14. Write mode granular permissions (hiện tại chỉ on/off toàn cục)
15. `db_mongo_explain` tool (hiện tại explainQuery cho MongoDB throw NotImplemented)

---

## Guide: Thêm Feature Mới

### Thêm Connector Mới (ví dụ: PostgreSQL)

1. Tạo `src/connectors/postgres.ts`, implement `DbConnector` interface
2. Thêm case vào `src/core/registry.ts` — `createConnector()` switch
3. Thêm Zod schema vào `src/config/schema.ts`
4. Thêm type vào `src/types.ts` — discriminated union `DbConnectionConfig`
5. Thêm prompt logic vào `src/setup/wizard.ts` — collectConnections()

### Thêm MCP Tool Mới

1. Thêm `server.tool(...)` call trong `src/tools/register-tools.ts`
2. Bọc trong `runAudited()` để có audit log tự động

### Thêm CLI Command Mới

1. Thêm `program.command(...)` trong `src/cli.ts`
