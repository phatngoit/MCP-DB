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

## Local Checkout Smoke Test

From the repository:

```bash
npm install
npm run build
node dist/cli.js validate-config --config examples/mcp-db.yml
node dist/cli.js test-connections --config ./mcp-db.local.yml
```

## HTTP Smoke Test

Start the server:

```bash
node dist/cli.js serve-http --config examples/mcp-db.yml --host 127.0.0.1 --port 3099 --api-key test-key
```

Check health:

```bash
curl http://127.0.0.1:3099/healthz
```

Unauthenticated MCP requests should return `401`. Authenticated requests must include one of these headers:

```text
Authorization: Bearer test-key
X-API-Key: test-key
```

## Release Checklist

Before publishing a new version:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=moderate
npm pack --dry-run
```
