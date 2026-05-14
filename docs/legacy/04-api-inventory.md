# API Inventory

## MCP Tools

Đây là các MCP tools mà AI clients có thể gọi:

| Tool Name | Input Params | Output | Notes |
|---|---|---|---|
| `db_list_connections` | (none) | JSON array `[{name, type, mode}]` | Liệt kê tất cả connections trong config |
| `db_test_connection` | `connection: string` | `{ok, message}` | Ping / SELECT 1 / db.command({ping:1}) |
| `db_list_schemas` | `connection: string` | `string[]` | Oracle: `all_users`, MSSQL: `sys.schemas`, Mongo: `admin.listDatabases` |
| `db_list_tables` | `connection, schema?` | `TableInfo[]` | Oracle: `all_tables`, MSSQL: `INFORMATION_SCHEMA.TABLES`, Mongo: `listCollections` |
| `db_describe_table` | `connection, table, schema?` | `TableDescription` | Oracle/MSSQL: column catalog queries; Mongo: sample 20 docs để infer schema |
| `db_query` | `connection, query, params?, maxRows?` | Markdown table string | Chỉ Oracle/MSSQL; validate readonly, mask fields |
| `db_explain_query` | `connection, query, params?` | `ExplainResult` | Chỉ Oracle/MSSQL; trả về execution plan |
| `db_mongo_find` | `connection, collection, filter?, projection?, sort?, maxRows?` | Markdown table string | Chỉ MongoDB; block `$out`/`$merge` |
| `db_mongo_aggregate` | `connection, collection, pipeline, maxRows?` | Markdown table string | Chỉ MongoDB; auto-append `$limit` vào cuối pipeline |

## HTTP Endpoints (serve-http mode)

| Method | Path | Auth | Mô tả |
|---|---|---|---|
| `GET` | `/healthz` | None | Health check, trả về `{ok, name, transport, connections, authRequired}` |
| `POST` | `/mcp` | Bearer / X-API-Key (nếu config) | MCP Streamable HTTP endpoint |
| `GET` | `/mcp` | — | 405 Method Not Allowed |
| `DELETE` | `/mcp` | — | 405 Method Not Allowed |

## CLI Commands

| Command | Mô tả |
|---|---|
| `setup` | Interactive wizard: chọn AI clients + DB types, tạo/merge config files |
| `init` | Non-interactive: tạo template `mcp-db.local.yml` + `.env.example` + `.gitignore` |
| `start` | Khởi động MCP server qua stdio |
| `serve-http` | Khởi động MCP server qua Streamable HTTP |
| `validate-config` | Parse và validate YAML config, không start server |
| `test-connections` | Test từng connection, exit code 1 nếu có lỗi |
| `ai-config` | In snippets cấu hình cho các AI clients |
