# .NET Project Setup

Run these commands from your .NET solution root:

```bash
npm install -g mcp-db-connect
mcp-db-connect init
```

This creates:

```text
mcp-db.local.yml
.env.example
```

It also updates `.gitignore` with:

```gitignore
.env
mcp-db.local.yml
logs/
```

Create your real `.env` file next to `mcp-db.local.yml`:

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
claude mcp add --transport stdio db-connect --scope local -- mcp-db-connect start
```

Codex CLI `config.toml`:

```toml
[mcp_servers.db-connect]
command = "mcp-db-connect"
args = ["start"]
enabled = true
```

Gemini CLI project-local `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "db-connect": {
      "command": "mcp-db-connect",
      "args": ["start"]
    }
  }
}
```

Ask the AI:

```text
Use db-connect to list database connections, then inspect the MSSQL dbo schema.
```
