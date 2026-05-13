# AI Client Setup

Most MCP-compatible desktop clients can run this server through stdio.

## Command

```bash
mcp-db-connect start --config /absolute/path/mcp-db.yml
```

If the package has not been published to npm yet, install from GitHub:

```bash
npm install -g github:phatngoit/MCP-DB
```

You can also run the local checkout directly:

```bash
node /absolute/path/MCP-DB/dist/cli.js start --config /absolute/path/mcp-db.yml
```

## Claude Desktop

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--config", "D:/PHATNV/SourceCode/MCP-DB/mcp-db.local.yml"]
    }
  }
}
```

## Cursor / VS Code

Use the same stdio command in your MCP configuration:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--config", "D:/PHATNV/SourceCode/MCP-DB/mcp-db.local.yml"]
    }
  }
}
```

## Streamable HTTP

For clients that support Streamable HTTP:

```bash
mcp-db-connect serve-http --config /absolute/path/mcp-db.yml --host 127.0.0.1 --port 3000 --path /mcp
```

Use this MCP endpoint:

```text
http://127.0.0.1:3000/mcp
```

For non-local access, require an API key:

```bash
MCP_DB_HTTP_API_KEY=change-me
mcp-db-connect serve-http --config /absolute/path/mcp-db.yml --host 0.0.0.0 --port 3000 --path /mcp --api-key-env MCP_DB_HTTP_API_KEY
```

Clients must send one of these headers:

```text
Authorization: Bearer change-me
X-API-Key: change-me
```

## Environment

Set the variables referenced by your config:

```bash
ORACLE_PASSWORD=...
MSSQL_PASSWORD=...
MONGODB_URI=mongodb://localhost:27017
```

## Prompt Example

Ask the AI:

```text
Use db_list_connections, inspect the reporting schema, then show me the top 20 orders by revenue.
```
