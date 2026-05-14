# Risk Register

## R1 — SQL Injection [MEDIUM]

**Vấn đề:** `db_query` nhận raw SQL string, chỉ validate bằng regex whitelist (`READONLY_SQL_PREFIXES`) và blacklist (`SQL_WRITE_OR_DDL`). Không có parameterized query enforcement ở layer MCP — AI có thể truyền query có cấu trúc phức tạp tránh regex.

**Source:** [src/core/security.ts](../src/core/security.ts) — `validateSqlQuery`, dòng 5-6.

**Khuyến nghị:** Thêm AST-based SQL parser (e.g. `node-sql-parser`) thay vì regex; enforce rằng `params` array được dùng thay vì interpolation trong prompt.

---

## R2 — MSSQL Không Bind Params [MEDIUM]

**Vấn đề:** `MssqlConnector.query()` gọi `pool.request().query(input.query)` trực tiếp, không bind `input.params` vào request. Params array bị bỏ qua.

**Source:** [src/connectors/mssql.ts](../src/connectors/mssql.ts) dòng 85-96.

```typescript
// BUG: input.params bị ignore
async query(input: QueryInput): Promise<QueryResult> {
  const pool = await this.getPool();
  const result = await pool.request().query(input.query); // params không được sử dụng
```

**Khuyến nghị:** Sử dụng `request.input()` cho từng param hoặc `request.batch()` với bind variables.

---

## R3 — MSSQL Row Limit Không Hiệu Quả [LOW]

**Vấn đề:** MSSQL query lấy toàn bộ recordset rồi `slice(0, maxRows)`. Với kết quả lớn, toàn bộ data được fetch về memory trước khi cắt.

**Source:** [src/connectors/mssql.ts](../src/connectors/mssql.ts) dòng 85-95.

**Khuyến nghị:** Inject `TOP @maxRows` vào query hoặc dùng `SET ROWCOUNT`.

---

## R4 — Oracle Connection String Injection [LOW]

**Vấn đề:** `connectString()` nối trực tiếp `host:port/serviceName` hoặc `host:port:sid` từ config. Nếu config file bị compromise, có thể inject ký tự đặc biệt vào connection string.

**Source:** [src/connectors/oracle.ts](../src/connectors/oracle.ts) dòng 233-241.

**Khuyến nghị:** Validate host/serviceName/sid bằng regex pattern trước khi build connection string.

---

## R5 — Password Lưu Trong Config YAML [HIGH]

**Vấn đề:** `OracleConnectionConfig.password`, `MssqlConnectionConfig.password`, `MongoConnectionConfig.uri` cho phép lưu trực tiếp trong YAML (không chỉ qua env var). Nếu `mcp-db.yml` (không phải `.local.yml`) bị commit, credentials bị lộ.

**Source:** [src/types.ts](../src/types.ts) dòng 22-24, 35-36, 43-44; [src/config/schema.ts](../src/config/schema.ts).

**Khuyến nghị:** Thêm validation warning/error khi `password` field được dùng trực tiếp thay vì `passwordEnv`; hoặc xem xét remove `password` field hoàn toàn.

---

## R6 — Audit Log Không Có Rotation [MEDIUM]

**Vấn đề:** `audit()` dùng `fs.appendFile()` đơn giản. Sau thời gian dài, file `.jsonl` có thể rất lớn, không có rotation, compression, hay max size.

**Source:** [src/core/audit.ts](../src/core/audit.ts) dòng 13-25.

**Khuyến nghị:** Tích hợp pino's transport hoặc winston có rolling file support; hoặc log sang stdout/stderr theo format JSONL thay vì file riêng.

---

## R7 — HTTP Server Không Có Request Timeout [MEDIUM]

**Vấn đề:** `startHttpServer()` không thiết lập timeout cho HTTP connections. Kết nối chậm hoặc hang có thể giữ socket mãi mãi.

**Source:** [src/server.ts](../src/server.ts) dòng 49-156.

**Khuyến nghị:** Thêm `server.timeout` và `server.keepAliveTimeout` trên Node.js HTTP server instance.

---

## R8 — MongoDB Schema Inference Yếu [LOW]

**Vấn đề:** `describeCollection()` chỉ sample 20 documents đầu tiên. Với collection lớn có schema đa dạng, type inference không đầy đủ. Field chỉ xuất hiện trong documents sau document thứ 20 sẽ bị bỏ qua.

**Source:** [src/connectors/mongodb.ts](../src/connectors/mongodb.ts) dòng 53-58.

**Khuyến nghị:** Dùng MongoDB `$sample` aggregation để random sampling; tăng số lượng sample; hoặc tích hợp MongoDB Schema Analyzer.

---

## R9 — Server Version Hardcoded [LOW]

**Vấn đề:** `createServer()` hardcode version `'0.1.10'` trong McpServer constructor, không đồng bộ với `package.json` version `0.1.12`.

**Source:** [src/server.ts](../src/server.ts) dòng 159.

**Khuyến nghị:** Import version từ `package.json` (`import pkg from '../package.json' assert {type: 'json'}`) hoặc từ cli args.

---

## R10 — Không Có Rate Limiting Trên HTTP Endpoint [MEDIUM]

**Vấn đề:** `/mcp` HTTP endpoint không có rate limiting. Một AI agent bug có thể tạo flood request.

**Source:** [src/server.ts](../src/server.ts) — không có middleware rate limit.

**Khuyến nghị:** Thêm `express-rate-limit` hoặc tương đương trước `app.post(options.path, ...)`.

---

## R11 — TOML Parsing Thô Trong Wizard [LOW]

**Vấn đề:** `removeTomlTable()` trong wizard.ts là parser thô, scan theo line. Nếu TOML có multi-line values hoặc nested tables phức tạp, có thể bị lỗi.

**Source:** [src/setup/wizard.ts](../src/setup/wizard.ts) dòng 812-834.

**Khuyến nghị:** Dùng thư viện TOML parser chính thức (e.g. `@ltd/j-toml`) thay vì regex-based string manipulation.

---

## Risk Summary

| ID | Severity | Description |
|---|---|---|
| R5 | HIGH | Password lưu plaintext trong YAML |
| R1 | MEDIUM | SQL injection qua regex-only validation |
| R2 | MEDIUM | MSSQL params bị bỏ qua (bug) |
| R6 | MEDIUM | Audit log không rotation |
| R7 | MEDIUM | HTTP server không timeout |
| R10 | MEDIUM | Không có rate limiting |
| R3 | LOW | MSSQL full fetch trước khi slice |
| R4 | LOW | Oracle connection string injection |
| R8 | LOW | MongoDB schema inference chỉ sample 20 docs |
| R9 | LOW | Server version hardcoded sai |
| R11 | LOW | TOML parser thô |
