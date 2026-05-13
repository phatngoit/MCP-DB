# Integration Testing

Use `test-connections` to verify configured databases before wiring the MCP server into an AI client.

```bash
mcp-db-connect test-connections --config ./mcp-db.yml
```

Local Docker examples are provided in `examples/docker-compose.yml`.

Oracle containers can take several minutes to become healthy on first startup.

The CLI exits with a non-zero code if any connection fails:

```bash
mcp-db-connect test-connections --config ./mcp-db.yml
```
