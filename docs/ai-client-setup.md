# AI Client Setup

Most MCP-compatible desktop clients can run this server through stdio.

## Command

Run AI tools from your project root. `mcp-db-connect` automatically finds `mcp-db.local.yml` and `.env` in the current project directory.

Recommended setup:

```bash
mcp-db-connect setup
```

The setup wizard lets you select Claude Code, Codex CLI, Gemini CLI, Kimi CLI, or generic MCP JSON, then select Oracle, MSSQL, and/or MongoDB connections. Each selected DB asks for its own IP/host and port.

```bash
mcp-db-connect start
```

Print all setup snippets:

```bash
mcp-db-connect ai-config
```

If the package has not been published to npm yet, install from GitHub:

```bash
npm install -g github:phatngoit/MCP-DB
```

You can also run the local checkout directly:

```bash
node /absolute/path/MCP-DB/dist/cli.js start
```

## Claude Code CLI

From your project root:

```bash
claude mcp add --transport stdio db-connect --scope local -- mcp-db-connect start --project . --config ./mcp-db.local.yml --env ./.env
```

The local MCP entry should now follow the current project instead of using fixed config paths.

## Codex CLI

For one project only, add this to the project's Codex config instead of the global Codex config:

```toml
[mcp_servers.db-connect]
command = '.\.mcp-tools\db-connect\node_modules\.bin\mcp-db-connect.cmd'
args = ["start", "--project", ".", "--config", '.\mcp-db.local.yml', "--env", '.\.env']
enabled = true

[mcp_servers.db-connect.env]
LOG_LEVEL = "silent"
```

Then start Codex from that project root:

```bash
cd D:\PHATNV\SourceCode\YourDotNetProject
codex
```

## Gemini CLI

Create or update project-local `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"]
    }
  }
}
```

Then start Gemini CLI from the project root.

## Kimi CLI

Create project-local `.kimi/mcp.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"]
    }
  }
}
```

Then start Kimi with:

```bash
kimi --mcp-config-file .\.kimi\mcp.json
```

## Claude Desktop / Cursor / VS Code

Use the same stdio command in your MCP configuration:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start", "--project", ".", "--config", "./mcp-db.local.yml", "--env", "./.env"]
    }
  }
}
```

## Streamable HTTP

For clients that support Streamable HTTP:

```bash
mcp-db-connect serve-http --host 127.0.0.1 --port 3000 --path /mcp
```

Use this MCP endpoint:

```text
http://127.0.0.1:3000/mcp
```

For non-local access, require an API key:

```bash
MCP_DB_HTTP_API_KEY=change-me
mcp-db-connect serve-http --host 0.0.0.0 --port 3000 --path /mcp --api-key-env MCP_DB_HTTP_API_KEY
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
