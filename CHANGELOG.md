# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## Unreleased

- Added a PostgreSQL connector (`type: postgres`) with schema/table listing, column/primary-key/foreign-key/index introspection, `EXPLAIN (FORMAT JSON)` plans, and connection-string or structured host/port config. Covered by the same `db_query`, `db_explain_query`, `db_count`, `db_list_schemas`, `db_list_tables`, and `db_describe_table` tools as Oracle and MSSQL.
- Added a MySQL/MariaDB connector (`type: mysql`) with the same tool coverage, using native `?` placeholders and `EXPLAIN FORMAT=JSON` plans.
- Setup wizard now supports PostgreSQL (`postgres://user:password@host:5432/database`) and MySQL/MariaDB (`mysql://user:password@host:3306/database`) connection strings.
- Listed the project on the official MCP Registry (`registry.modelcontextprotocol.io`) via `server.json`, published automatically on release through GitHub Actions OIDC. Documented Glama.ai's manual-submission status and why a Smithery.ai listing is deferred until Docker support ships.
- Fixed the root `Dockerfile`, which failed to build because it never copied `tsconfig.build.json` into the build stage. Added `CMD ["start"]`, `EXPOSE 3000`, a `.dockerignore`, an `examples/docker-compose.server.yml` example, and a release workflow job that builds and pushes the image to `ghcr.io/phatngoit/mcp-db-connect` (tagged with the release version and `latest`).
- Added a Qdrant connector (`type: qdrant`) for vector search: `db_qdrant_search` (similarity search with optional filter/score threshold), `db_qdrant_scroll` (browse/filter without a vector), and `db_qdrant_count`. `db_list_tables`/`db_describe_table` list collections and their vector/payload field schema; `db_list_schemas` returns an empty list since Qdrant has no schema concept. Setup wizard now supports pasting a Qdrant URL and optional API key.
- Added unit tests for every connector (Oracle, MSSQL, MongoDB, PostgreSQL, MySQL/MariaDB, Qdrant) that mock the underlying driver package to cover query building, row/index aggregation, truncation logic, and error handling — including Oracle's NCHAR→VARCHAR2 auto-cast retry path — without needing a live database.
- Made the MongoDB `db_describe_table` sample size configurable instead of a hardcoded 20 documents: set `describeSampleSize` on a `mongodb` connection for a per-connection default, or pass `sampleSize` on the `db_describe_table` tool call to override it per request.
- Added `MCP_DB_CONFIG`: set it to the full config (YAML or JSON) to skip file-based config discovery entirely, for platforms that can only inject environment variables into a container (Smithery.ai and similar). The Docker entrypoint (`docker-entrypoint.sh`) also now auto-switches from stdio to the Streamable HTTP transport, binding `0.0.0.0:$PORT`, whenever a `PORT` environment variable is present — the convention used by Smithery.ai, Railway, Render, and Fly.io. Added a best-effort `smithery.yaml` container-runtime manifest (flagged for verification against Smithery's current docs before relying on it).
- Added a SQLite connector (`type: sqlite`) using `better-sqlite3`: a `file` path instead of host/port, native `?` positional binds, `EXPLAIN QUERY PLAN` plans, and PRAGMA-based schema/table/column/foreign-key/index introspection. Covered by the same `db_query`, `db_explain_query`, `db_count`, `db_list_schemas`, `db_list_tables`, and `db_describe_table` tools as the other SQL connectors; `db_list_schemas` reflects `PRAGMA database_list` (`main` plus any attached databases). Setup wizard now prompts for a file path for SQLite instead of a connection string.

## 0.1.17

- Fixed `MssqlConnector.query()` and `explainQuery()` silently ignoring the `params` bind array passed to `db_query`/`db_explain_query`. MSSQL now binds params as named parameters `@p1`, `@p2`, ... in array order (Oracle already worked via positional `:1`, `:2` binds).
- Setup wizard now asks for a single connection string per database connection (MSSQL, Oracle, MongoDB) instead of separate host/port/database/username/password prompts.
- Added `connectionString`/`connectionStringEnv` support to MSSQL connections and `connectDescriptor` support to Oracle connections, so a raw ADO/tedious or TNS connection string can be used directly instead of structured fields.

## 0.1.16

- Simplified setup wizard: each database now asks only 5 essential fields (host, port, database/service, username, password).
- Removed technical prompts that most users do not need to answer: `encrypt`, `trustServerCertificate`, `passwordEnv` for MSSQL; `thick mode`, `clientLibDir`, `passwordEnv` for Oracle; `authSource`, `uriEnv` for MongoDB.
- Environment variable names are now auto-generated and printed after each connection entry.
- Setup summary now includes a note to edit `mcp-db.local.yml` for advanced options.
- Simplified README install section to a clear 3-step flow.

## 0.1.15

- Fixed Oracle `db_describe_table` to return primary keys, foreign keys, and indexes (now consistent with MSSQL).
- Added `db_count` tool for Oracle and MSSQL: counts rows in a table with an optional WHERE clause.
- Added `db_mongo_count`: counts documents in a MongoDB collection with an optional filter.
- Added `db_mongo_get_indexes`: lists all indexes for a MongoDB collection.
- Added `db_mongo_explain_find`: returns an execution plan for a MongoDB find operation.
- Added `db_mongo_explain_aggregate`: returns an execution plan for a MongoDB aggregate pipeline.

## 0.1.14

- Fixed CLI version (`--version`) always showing a stale hardcoded value; now reads dynamically from `package.json`.
- Fixed MCP server advertised version hardcoded in `McpServer` constructor; now in sync with `package.json`.

## 0.1.13

- Format all structured data returned to the user as markdown tables with fields as column headers and values in rows below.
- `db_list_schemas`, `db_list_tables`, and `db_describe_table` now return markdown tables instead of raw JSON.

## 0.1.12

- Used `npx` as the command in generated AI client configs so the MCP server starts correctly for both local and global installs.
- Documented global vs local install differences for Claude Code in README.

## 0.1.11

- Automatic NCHAR/NVARCHAR2 column cast to VARCHAR2 server-side so Oracle Thin mode handles all SELECT queries without Oracle Instant Client.
- Automatic CLOB and NCLOB streaming to string instead of returning raw stream objects.
- Removed ORACLE_CLIENT_LIB_DIR environment variable; clientLibDir is now configured directly in YAML.

## 0.1.10

- Added optional Oracle Thick mode configuration for databases with unsupported Thin mode character sets.
- Improved Oracle error messages for unsupported `NLS_NCHAR_CHARACTERSET` failures.

## 0.1.9

- Safely formatted complex and circular Oracle values in Markdown table output.
- Documented Oracle thin mode so Oracle Instant Client is not required by default.
- Added `.claude/settings.local.json` to generated `.gitignore` entries.

## 0.1.8

- Added `node_modules/` to `.gitignore` entries generated by `setup` and `init`.

## 0.1.7

- Allowed the interactive setup wizard to add multiple connections for the same database type in one run.
- Bumped the package version after `0.1.6` was already published to npm.

## 0.1.6

- Added `mcp-db-connect setup`, an interactive wizard for selecting AI clients and database types.
- Added project-local AI config generation for Claude Code, Codex CLI, Gemini CLI, Kimi CLI, and generic MCP JSON.
- Clarified per-connection DB port prompts and documentation.
- Expanded README setup instructions with per-client examples.

## 0.1.5

- Formatted query, MongoDB find, and MongoDB aggregate results as Markdown tables for easier AI reading.

## 0.1.4

- Added automatic `.gitignore` updates during `init` for `.env`, `mcp-db.local.yml`, and `logs/`.

## 0.1.3

- Added project-local config and `.env` auto-discovery for simpler AI client setup.
- Changed `init` to create `mcp-db.local.yml` and `.env.example` by default.

## 0.1.2

- Fixed npm package metadata for the CLI binary entry before initial npm publish.

## 0.1.1

- Added optional API key protection for Streamable HTTP MCP requests.
- Expanded AI client setup, HTTP auth, and integration testing documentation.

## 0.1.0

- Initial MCP server for Oracle, Microsoft SQL Server, and MongoDB.
- Added stdio and Streamable HTTP transports.
- Added readonly-first query tools, schema inspection, MongoDB find and aggregate tools.
- Added SQL execution plan support for Oracle and Microsoft SQL Server.
- Added config validation, connection testing, audit logging, field masking, row limits, and query guards.
