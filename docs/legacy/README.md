# Legacy Analysis — MCP-DB

Bộ tài liệu phân tích codebase `mcp-db-connect` v0.1.12. Được tạo tự động bằng `legacy-system-analyst`.

## Tài Liệu

| File | Nội dung |
|---|---|
| [01-overview.md](01-overview.md) | Tổng quan dự án, tech stack, entry points |
| [02-architecture.md](02-architecture.md) | Cấu trúc thư mục, luồng thực thi, transport modes, design patterns |
| [03-business-flows.md](03-business-flows.md) | Các business flows chính (setup, query, mongo, explain) |
| [04-api-inventory.md](04-api-inventory.md) | MCP tools, HTTP endpoints, CLI commands |
| [05-data-model.md](05-data-model.md) | AppConfig schema, connection configs, internal types |
| [06-integrations.md](06-integrations.md) | DB drivers, MCP SDK, AI clients, Docker |
| [07-risk-register.md](07-risk-register.md) | 11 risks (1 HIGH, 5 MEDIUM, 5 LOW) với khuyến nghị |
| [08-modernization-roadmap.md](08-modernization-roadmap.md) | 4-phase roadmap + guide thêm feature mới |

## Quick Facts

- **Package:** `mcp-db-connect` v0.1.12
- **Databases:** Oracle, MSSQL, MongoDB
- **Transport:** stdio (default) + Streamable HTTP
- **Security model:** readonly-first, SQL validation, field masking, audit log
- **Critical bug:** MSSQL params bị bỏ qua trong `MssqlConnector.query()` → `src/connectors/mssql.ts:85`
- **Highest risk:** Password lưu plaintext trong config YAML
