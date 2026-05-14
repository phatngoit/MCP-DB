# Business Flows

## Flow 1: Setup AI + Database Mới

```
mcp-db-connect setup
  -> promptMultiple(AI clients)      [claude|codex|gemini|kimi|generic]
  -> promptMultiple(DB types)        [oracle|mssql|mongodb]
  -> collectConnections()            [per DB: host, port, creds, options]
  -> mergeConfigFile()               [write/merge mcp-db.local.yml]
  -> mergeEnvFile()                  [write/merge .env]
  -> ensureGitignore()               [append .gitignore entries]
  -> writeAiClientConfigs()          [write .mcp.json / .codex/config.toml / .gemini/settings.json / .kimi/mcp.json]
```

## Flow 2: AI Tool Gọi `db_query`

```
AI Client -> MCP Tool call "db_query" { connection, query, params, maxRows }
  -> validateSqlQuery()              [check prefix SELECT/WITH/EXPLAIN, block write keywords, block multi-statement]
  -> assertAllowedObject()           [schema/table allowlist + denylist check]
  -> resolveLimit()                  [min(requested, connection.maxRows, security.defaultMaxRows)]
  -> connector.query()               [driver-specific execution]
  -> maskResult()                    [replace sensitive field values with '[masked]']
  -> formatQueryResult()             [render Markdown table]
  -> audit()                         [append JSONL log entry]
  -> return MCP text content
```

## Flow 3: MongoDB Find

```
AI Client -> MCP Tool call "db_mongo_find" { connection, collection, filter, projection, sort, maxRows }
  -> assertAllowedObject(collection) [table allowlist/denylist]
  -> resolveLimit()
  -> MongodbConnector.find()         [MongoClient.collection.find().sort().limit()]
  -> maskResult() -> formatQueryResult() -> audit()
```

## Flow 4: Explain Query (SQL Only)

```
AI Client -> "db_explain_query" { connection, query }
  -> validateSqlQuery()
  -> Oracle:  EXPLAIN PLAN + DBMS_XPLAN.DISPLAY
  -> MSSQL:   SET SHOWPLAN_TEXT ON trong transaction, rollback sau khi lấy plan
  -> return ExplainResult { format: 'text'|'rows', plan: [] }
```

## Flow 5: MongoDB Aggregate

```
AI Client -> "db_mongo_aggregate" { connection, collection, pipeline, maxRows }
  -> assertAllowedObject(collection)
  -> validate pipeline: block $out, $merge stages
  -> auto-append { $limit: resolveLimit() } vào cuối pipeline
  -> MongodbConnector.aggregate()    [MongoClient.collection.aggregate(pipeline)]
  -> maskResult() -> formatQueryResult() -> audit()
```
