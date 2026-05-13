# AI Client Setup

Most MCP-compatible desktop clients can run this server through stdio.

## Command

```bash
mcp-db-connect start --config /absolute/path/mcp-db.yml
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
