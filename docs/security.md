# Security

The recommended production setup is:

- Use readonly DB users.
- Keep `allowWriteOperations: false`.
- Configure `allowSchemas` and `allowTables` for sensitive environments.
- Keep `blockMultiStatement: true`.
- Set short query timeouts.
- Enable `auditLogPath`.
- Pass secrets through environment variables.
- Keep Streamable HTTP bound to `127.0.0.1` unless remote access is required.
- Use `--api-key-env` when exposing Streamable HTTP outside localhost.

The MCP server blocks common dangerous SQL and MongoDB operations, but DB-level permissions are still required.

## Streamable HTTP API Key

When an API key is configured, `/mcp` requires either `Authorization: Bearer <key>` or `X-API-Key: <key>`.

```bash
mcp-db-connect serve-http --config ./mcp-db.yml --api-key-env MCP_DB_HTTP_API_KEY
```

The `/healthz` endpoint remains unauthenticated and reports whether auth is required.
