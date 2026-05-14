# .NET Project Setup

Run these commands from your .NET solution root:

```bash
npm install -g mcp-db-connect
mcp-db-connect setup
```

This creates:

```text
mcp-db.local.yml
.env
.mcp.json / .codex/config.toml / .gemini/settings.json / .kimi/mcp.json depending on your AI selection
```

It also updates `.gitignore` with:

```gitignore
node_modules/
.env
mcp-db.local.yml
logs/
.mcp-tools/
```

The wizard asks for the DB type and connection details. Each selected DB has its own IP/host and port, so MSSQL, Oracle, and MongoDB do not need to share the same port. A generated `.env` for three internal connections can look like this:

If one project needs multiple connections of the same type, answer `y` when the wizard asks whether to add another connection. Each connection must have a unique name.

```dotenv
MSSQL_REPORT_PASSWORD=change-me
ORACLE_FTMS_PASSWORD=change-me
MONGODB_LOG_URI=mongodb://user:password@host:27017/fti_ivoice_db
```

Test from the solution root:

```bash
mcp-db-connect test-connections
```

## AI CLI Setup

All clients should run from the same .NET solution root. The MCP server will discover `mcp-db.local.yml` and `.env` automatically.

Print setup snippets:

```bash
mcp-db-connect ai-config
```

Claude Code CLI:

```bash
claude mcp add --transport stdio db-connect --scope local -- mcp-db-connect start --project . --config ./mcp-db.local.yml --env ./.env
```

Codex CLI project-local `.codex/config.toml`:

```toml
[mcp_servers.db-connect]
command = '.\.mcp-tools\db-connect\node_modules\.bin\mcp-db-connect.cmd'
args = ["start", "--project", ".", "--config", '.\mcp-db.local.yml', "--env", '.\.env']
enabled = true

[mcp_servers.db-connect.env]
LOG_LEVEL = "silent"
```

Gemini CLI project-local `.gemini/settings.json`:

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

Kimi CLI project-local `.kimi/mcp.json`:

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

Start Kimi with:

```bash
kimi --mcp-config-file .\.kimi\mcp.json
```

Ask the AI:

```text
Use db-connect to list database connections, then inspect the MSSQL dbo schema.
```
