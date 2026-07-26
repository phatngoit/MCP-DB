# Simplify setup wizard with connection-string input

## Problem

The interactive setup wizard (`mcp-db-connect setup`) asks 5-6 separate prompts per
database connection (name, host, port, database/service name, username, password).
Every real-world user already has this information bundled as a single connection
string from their DB host, hosting provider, or an existing app config (Atlas,
Azure Portal, SSMS "Copy Connection String", ODP.NET `appsettings.json`, etc.).
Re-typing it field by field is unnecessary friction and a source of transcription
errors (wrong port, mistyped host).

## Goal

Replace the per-field prompts with a single "connection string" prompt per
connection, for all three database types (MSSQL, Oracle, MongoDB). Reduce each
connection from ~5-6 prompts down to 2: connection name + connection string.

## Non-goals

- Not changing the `npm install` / `npx setup` invocation steps.
- Not building a fallback field-by-field flow. If the pasted string doesn't parse,
  the wizard prints an example of the expected format and re-prompts — no second
  path to maintain.
- Not attempting to represent every ODP.NET/ADO.NET tuning knob (e.g. `Max Pool
  Size`, `Validate Connection`) in our config schema. Unknown keys in a parsed
  string are silently dropped; users needing that level of tuning already have
  `mcp-db.local.yml` to hand-edit.
- Not changing AI-client config generation (`.mcp.json`, `.codex/config.toml`, etc.)
  — only the database-connection portion of the wizard changes.
- Existing structured YAML connections (`host`/`port`/`database`/...) keep working
  unchanged. This adds a new input *mode*; it does not replace or migrate old ones.

## Background: real-world connection strings (shapes validated against actual
examples; host/credential values below are sanitized placeholders, not real)

**MongoDB** — standard URI, already what the config schema stores today via `uri`/`uriEnv`:
```
mongodb://demo_mongo_user:demo_mongo_pass1@10.20.30.10:27017/demo_billing_db
```

**MSSQL** — ADO.NET "classic" connection string. The `mssql` npm package's
`ConnectionPool` constructor accepts this format natively (confirmed in its
README: "Formats > Classic Connection String"), including keys we don't
otherwise model (`MultipleActiveResultSets`, `TrustServerCertificate`):
```
Server=10.20.30.53,1439;Database=DemoDb;User ID=demo_ms_user;Password=demo_ms_pass1;MultipleActiveResultSets=True;TrustServerCertificate=True;
```

**Oracle** — ODP.NET-style string: a TNS connect descriptor under `Data Source=`,
plus separate `User Id=`/`Password=` keys, plus .NET-only tuning keys we ignore:
```
Data Source=(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=10.20.30.15)(PORT=1521)))(CONNECT_DATA=(SERVER=POOLED)(SERVICE_NAME=DEMOPDB1)));User Id=demo_ora_user;Password=demo_ora_pass1;Validate Connection=true;Max Pool Size=1000
```
`node-oracledb`'s `connectString` option accepts a full TNS descriptor verbatim
(not just Easy Connect `host:port/service`), so the `Data Source=` value can be
passed through unparsed — preserving `SERVER=POOLED`, RAC/failover multi-address
lists, etc. that a host/port/service-only schema cannot represent.

Because Oracle TNS descriptor syntax uses parentheses (not semicolons) as
separators, a naive split of the whole ODP.NET string on top-level `;` correctly
isolates `Data Source=(...)` from the sibling `User Id=`/`Password=`/other keys.

## Design

### Schema changes (`src/types.ts`, `src/config/schema.ts`)

- `OracleConnectionConfig`: add optional `connectDescriptor?: string`. Make
  `host`/`port` optional (currently required). Keep `serviceName`/`sid` as-is.
- `MssqlConnectionConfig`: add optional `connectionString?: string` and
  `connectionStringEnv?: string` (mirrors `password`/`passwordEnv` pairing
  already used elsewhere in this file). Make `host`/`port`/`database` optional.
- Zod schemas (`schema.ts`) gain matching optional fields plus a `.refine()` on
  each of `oracleConnectionSchema` and `mssqlConnectionSchema`: valid iff either
  the structured fields (`host` + service/sid, or `host`+`database` for mssql)
  are present, OR the string-mode field (`connectDescriptor` /
  `connectionString`/`connectionStringEnv`) is present. Prevents a hand-edited
  YAML from silently having neither.
- `MongoConnectionConfig` is unchanged — `uri`/`uriEnv` already cover this mode.

### Connector changes

- `src/connectors/oracle.ts`, `connectString()`: if `this.config.connectDescriptor`
  is set, return it directly; otherwise keep the existing
  `${host}:${port}/${serviceName}` / `${host}:${port}:${sid}` construction.
  `username`/`password`/`passwordEnv` are used exactly as today in both modes —
  the wizard extracts `User Id=`/`Password=` into those existing fields rather
  than inventing new ones.
- `src/connectors/mssql.ts`, `getPool()`: if `connectionString`/`connectionStringEnv`
  is set, construct the pool as `new sql.ConnectionPool(readSecret(config.connectionString, config.connectionStringEnv)).connect()`
  — the raw string, no object config. Otherwise keep the existing object-based
  construction (`server`, `port`, `database`, `user`, `password`, `options`, `pool`).
- No changes to `db_query`/audit/masking/security layers. Passwords stay
  environment-variable-only in all modes; nothing secret is written to YAML.

### Wizard changes (`src/setup/wizard.ts`)

Per connection, per DB type, replace the current host/port/database/username/password
prompt sequence with:

1. Connection name (unchanged — existing `promptConnectionName`).
2. Single prompt: `Connection string`.

Parsing per type:

- **MongoDB**: no parsing of credentials/host — store the pasted string verbatim
  via `uriEnv`. Extract only the trailing path segment (before any `?query`) as
  the `database` field, since the connector always calls
  `client.db(this.config.database)` explicitly regardless of the URI's own path.
  If no path segment is found, treat as a parse failure (see below).
- **MSSQL**: no parsing at all — store the pasted string verbatim via
  `connectionStringEnv`. Only sanity-check that it looks like a connection
  string (contains at least one `key=value;` pair) before accepting, so obvious
  garbage input gets a retry prompt instead of a cryptic runtime error later.
- **Oracle**: two accepted shapes:
  - ODP.NET style: string contains `Data Source=` (case-insensitive). Split on
    top-level `;`, build a case-insensitive key map, require `Data Source` and
    `User Id`/`UserId`/`User ID`; `Password` optional (see below). Store
    `Data Source` value as `connectDescriptor`. Ignore all other keys.
  - Easy Connect combined form: `user/password@<rest>` (matches what some tools
    hand out instead of the ODP.NET wrapper). Regex-parse into username/password
    plus `connectDescriptor` = everything after `@`, captured and stored verbatim
    without validating its internal shape — `node-oracledb`'s `connectString`
    accepts both `host:port/service_name` and `host:port:sid` forms, so the
    wizard does not need to distinguish between them.
  - If neither shape matches, or a shape matches but is missing the username,
    print the two accepted example formats and re-prompt (loop, same file as
    today's `promptRequired`-style helpers).
  - If a shape matches but has no password (credential-less string), prompt for
    Password separately as one extra step — this is the one narrow case where a
    second prompt remains, since Oracle strings are sometimes shared without
    embedded credentials.

Connection-name defaulting (`defaultConnectionName`) is unchanged.

### Backward compatibility

Nothing existing breaks: old `mcp-db.local.yml` files using structured fields
continue to validate and connect exactly as before. This is purely an additive
input mode, gated by which optional fields are present.

## Docs to update

- `README.md`: "Install" section wizard description, and the `Config` section
  gets a short example showing the new `connectionStringEnv` / `connectDescriptor`
  forms alongside the existing structured example.
- `CHANGELOG.md`: new entry.
- `docs/domain.md`: connector module-map rows if they call out the old prompt shape.

## Testing

- Unit tests for the Oracle string parser (both shapes, including the exact
  three example strings in this doc) and the Mongo database-name extraction —
  colocated as `*.test.ts` next to `wizard.ts`, no live DB required.
- MSSQL needs no parser, so no dedicated parsing unit tests; a config-schema
  test confirms `connectionStringEnv`-only connections pass Zod validation.
- No new integration/live-DB tests (matches existing project convention — see
  `docs/integration-testing.md`).
