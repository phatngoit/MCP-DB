import { z } from 'zod';

const accessModeSchema = z.enum(['readonly', 'readwrite']).default('readonly');

const baseConnectionSchema = z.object({
  name: z.string().optional(),
  mode: accessModeSchema,
  maxRows: z.number().int().positive().optional(),
  queryTimeoutMs: z.number().int().positive().optional(),
  allowSchemas: z.array(z.string()).optional(),
  denySchemas: z.array(z.string()).optional(),
  allowTables: z.array(z.string()).optional(),
  denyTables: z.array(z.string()).optional(),
});

const oracleConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('oracle'),
  host: z.string(),
  port: z.number().int().positive().default(1521),
  serviceName: z.string().optional(),
  sid: z.string().optional(),
  username: z.string(),
  password: z.string().optional(),
  passwordEnv: z.string().optional(),
  clientMode: z.enum(['thin', 'thick']).default('thin'),
  clientLibDir: z.string().optional(),
  clientLibDirEnv: z.string().optional(),
});

const mssqlConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('mssql'),
  host: z.string(),
  port: z.number().int().positive().default(1433),
  database: z.string(),
  username: z.string(),
  password: z.string().optional(),
  passwordEnv: z.string().optional(),
  encrypt: z.boolean().default(true),
  trustServerCertificate: z.boolean().default(false),
});

const mongoConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('mongodb'),
  uri: z.string().optional(),
  uriEnv: z.string().optional(),
  database: z.string(),
});

export const appConfigSchema = z.object({
  security: z
    .object({
      defaultMaxRows: z.number().int().positive().default(100),
      queryTimeoutMs: z.number().int().positive().default(10_000),
      blockMultiStatement: z.boolean().default(true),
      allowWriteOperations: z.boolean().default(false),
      maskColumns: z.array(z.string()).default(['password', 'token', 'secret', 'api_key']),
      auditLogPath: z.string().optional(),
    })
    .default({}),
  connections: z.record(
    z.discriminatedUnion('type', [
      oracleConnectionSchema,
      mssqlConnectionSchema,
      mongoConnectionSchema,
    ]),
  ),
});
