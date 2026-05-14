# External Integrations

## Database Drivers

| Driver | Package | Connection Pooling | Notes |
|---|---|---|---|
| Oracle | `oracledb` ^6.7.2 | `oracledb.createPool` (min:0, max:4) | Thin mode default (không cần Instant Client); tự động cast NCHAR -> VARCHAR2 khi phát hiện NLS_NCHAR_CHARACTERSET error; CLOB/NCLOB auto-stream to string |
| MSSQL | `mssql` ^11.0.1 | `ConnectionPool` (min:0, max:4) | SHOWPLAN_TEXT trong rollback-transaction cho explain |
| MongoDB | `mongodb` ^6.12.0 | MongoClient (internal pooling) | Schema infer bằng cách sample 20 documents |

## MCP SDK

`@modelcontextprotocol/sdk` ^1.0.0:
- `McpServer` — server instance
- `StdioServerTransport` — stdio transport
- `StreamableHTTPServerTransport` — HTTP transport
- `createMcpExpressApp` — Express app factory (gồm DNS rebinding protection)

## AI Clients (consumers, không phải dependencies)

Các AI clients tích hợp qua stdio hoặc HTTP:

| Client | Config File | Transport |
|---|---|---|
| Claude Code | `.mcp.json` (scope: local) | stdio |
| Codex CLI | `.codex/config.toml` + `.mcp-tools/db-connect/` local install | stdio |
| Gemini CLI | `.gemini/settings.json` | stdio |
| Kimi CLI | `.kimi/mcp.json` (dùng với `--mcp-config-file`) | stdio |
| Generic MCP | `.mcp-db-connect/mcp.json` | stdio hoặc HTTP |

## Docker / Infra

- `Dockerfile`: multi-stage build (node:22-slim)
- `examples/docker-compose.yml`: MSSQL 2022, MongoDB 7, Oracle Free 23-slim phục vụ local testing

## Config File Hierarchy

```
mcp-db.yml           (không commit — global config)
mcp-db.local.yml     (không commit — local override, được tạo bởi wizard)
.env                 (không commit — environment variables)
.env.example         (commit — template)
```
