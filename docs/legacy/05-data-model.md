# Data Model & Config Schema

## AppConfig (Zod validated YAML)

```
AppConfig
  security: SecurityConfig
    defaultMaxRows: number           (default 100)
    queryTimeoutMs: number           (default 10000)
    blockMultiStatement: boolean     (default true)
    allowWriteOperations: boolean    (default false)
    maskColumns: string[]            (default ['password','token','secret','api_key'])
    auditLogPath?: string
  connections: Record<connectionName, DbConnectionConfig>
```

## OracleConnectionConfig

```
type: 'oracle'
host: string
port: number                        (default 1521)
serviceName?: string
sid?: string
username: string
password?: string                   (⚠️ prefer passwordEnv)
passwordEnv?: string
clientMode: 'thin' | 'thick'        (default 'thin')
clientLibDir?: string
clientLibDirEnv?: string
mode: 'readonly' | 'readwrite'      (default 'readonly')
maxRows?: number
queryTimeoutMs?: number
allowSchemas?: string[]
denySchemas?: string[]
allowTables?: string[]
denyTables?: string[]
```

## MssqlConnectionConfig

```
type: 'mssql'
host: string
port: number                        (default 1433)
database: string
username: string
password?: string                   (⚠️ prefer passwordEnv)
passwordEnv?: string
encrypt: boolean                    (default true)
trustServerCertificate: boolean     (default false)
mode: 'readonly' | 'readwrite'      (default 'readonly')
maxRows?: number
queryTimeoutMs?: number
allowSchemas?: string[]
denySchemas?: string[]
allowTables?: string[]
denyTables?: string[]
```

## MongoConnectionConfig

```
type: 'mongodb'
uri?: string                        (⚠️ prefer uriEnv)
uriEnv?: string
database: string
mode: 'readonly' | 'readwrite'      (default 'readonly')
maxRows?: number
queryTimeoutMs?: number
allowSchemas?: string[]
denySchemas?: string[]
allowTables?: string[]
denyTables?: string[]
```

## QueryResult (internal)

```typescript
{
  rows: unknown[];
  rowCount: number;
  truncated: boolean;
}
```

## AuditEvent (JSONL log)

```typescript
{
  timestamp: string;     // ISO string
  connection: string;
  tool: string;          // MCP tool name
  operation: string;     // test|list_schemas|list_tables|describe_table|query|explain_query|find|aggregate
  success: boolean;
  error?: string;
}
```

## TableDescription (schema introspection)

```typescript
{
  schema?: string;
  name: string;
  columns: ColumnInfo[];
}

ColumnInfo {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: string | null;
}
```

## ExplainResult

```typescript
{
  format: 'text' | 'rows';
  plan: unknown[];
}
```
