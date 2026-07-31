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
  host: z.string().optional(),
  port: z.number().int().positive().default(1521),
  serviceName: z.string().optional(),
  sid: z.string().optional(),
  connectDescriptor: z.string().optional(),
  username: z.string(),
  password: z.string().optional(),
  passwordEnv: z.string().optional(),
  clientMode: z.enum(['thin', 'thick']).default('thin'),
  clientLibDir: z.string().optional(),
  clientLibDirEnv: z.string().optional(),
});

const mssqlConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('mssql'),
  host: z.string().optional(),
  port: z.number().int().positive().default(1433),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  passwordEnv: z.string().optional(),
  connectionString: z.string().optional(),
  connectionStringEnv: z.string().optional(),
  encrypt: z.boolean().default(true),
  trustServerCertificate: z.boolean().default(false),
});

const mongoConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('mongodb'),
  uri: z.string().optional(),
  uriEnv: z.string().optional(),
  database: z.string(),
});

const postgresConnectionSchema = baseConnectionSchema.extend({
  type: z.literal('postgres'),
  host: z.string().optional(),
  port: z.number().int().positive().default(5432),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  passwordEnv: z.string().optional(),
  connectionString: z.string().optional(),
  connectionStringEnv: z.string().optional(),
  ssl: z.boolean().default(false),
  rejectUnauthorized: z.boolean().default(true),
});

const dbConnectionSchema = z
  .discriminatedUnion('type', [
    oracleConnectionSchema,
    mssqlConnectionSchema,
    mongoConnectionSchema,
    postgresConnectionSchema,
  ])
  .superRefine((config, ctx) => {
    if (config.type === 'oracle' && !config.connectDescriptor && !config.host) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Oracle connection requires either connectDescriptor, or host with serviceName/sid.',
        path: ['host'],
      });
    }

    if (
      config.type === 'mssql' &&
      !config.connectionString &&
      !config.connectionStringEnv &&
      (!config.host || !config.database)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'MSSQL connection requires either connectionString/connectionStringEnv, or host and database.',
        path: ['host'],
      });
    }

    if (
      config.type === 'postgres' &&
      !config.connectionString &&
      !config.connectionStringEnv &&
      (!config.host || !config.database)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'PostgreSQL connection requires either connectionString/connectionStringEnv, or host and database.',
        path: ['host'],
      });
    }
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
  connections: z.record(dbConnectionSchema),
});
