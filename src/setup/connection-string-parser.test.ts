import { describe, expect, it } from 'vitest';
import {
  extractMongoDatabaseName,
  parseMongoConnectionString,
  parseMssqlConnectionString,
  parseOracleConnectionString,
  parsePostgresConnectionString,
} from './connection-string-parser.js';

const ORACLE_ODP_NET_EXAMPLE =
  'Data Source=(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=10.20.30.15)(PORT=1521)))(CONNECT_DATA=(SERVER=POOLED)(SERVICE_NAME=DEMOPDB1)));User Id=demo_ora_user;Password=demo_ora_pass1;Validate Connection=true;Max Pool Size=1000';

const MSSQL_EXAMPLE =
  'Server=10.20.30.53,1439;Database=DemoDb;User ID=demo_ms_user;Password=demo_ms_pass1;MultipleActiveResultSets=True;TrustServerCertificate=True;';

const MONGO_EXAMPLE = 'mongodb://demo_mongo_user:demo_mongo_pass1@10.20.30.10:27017/demo_billing_db';

const POSTGRES_EXAMPLE = 'postgres://demo_pg_user:demo_pg_pass1@10.20.30.20:5432/demo_billing_db';

describe('parseOracleConnectionString', () => {
  it('parses an ODP.NET connection string, keeping the descriptor intact', () => {
    const result = parseOracleConnectionString(ORACLE_ODP_NET_EXAMPLE);
    expect(result).toEqual({
      username: 'demo_ora_user',
      password: 'demo_ora_pass1',
      connectDescriptor:
        '(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=10.20.30.15)(PORT=1521)))(CONNECT_DATA=(SERVER=POOLED)(SERVICE_NAME=DEMOPDB1)))',
    });
  });

  it('parses an Easy Connect string with embedded credentials', () => {
    const result = parseOracleConnectionString('app_readonly/secret@localhost:1521/ORCLPDB1');
    expect(result).toEqual({
      username: 'app_readonly',
      password: 'secret',
      connectDescriptor: 'localhost:1521/ORCLPDB1',
    });
  });

  it('parses an Easy Connect string with no password', () => {
    const result = parseOracleConnectionString('app_readonly/@localhost:1521/ORCLPDB1');
    expect(result).toEqual({
      username: 'app_readonly',
      password: undefined,
      connectDescriptor: 'localhost:1521/ORCLPDB1',
    });
  });

  it('returns null for an unrecognized format', () => {
    expect(parseOracleConnectionString('not a connection string')).toBeNull();
  });

  it('returns null for an ODP.NET string missing User Id', () => {
    expect(
      parseOracleConnectionString('Data Source=(DESCRIPTION=(HOST=x));Password=secret'),
    ).toBeNull();
  });
});

describe('extractMongoDatabaseName', () => {
  it('extracts the database name from a standard URI', () => {
    expect(extractMongoDatabaseName(MONGO_EXAMPLE)).toBe('demo_billing_db');
  });

  it('extracts the database name ignoring query params', () => {
    expect(
      extractMongoDatabaseName('mongodb+srv://user:pass@cluster.mongodb.net/mydb?retryWrites=true'),
    ).toBe('mydb');
  });

  it('returns null when the URI has no path', () => {
    expect(extractMongoDatabaseName('mongodb://host:27017')).toBeNull();
  });
});

describe('parseMongoConnectionString', () => {
  it('parses a full Mongo URI', () => {
    expect(parseMongoConnectionString(MONGO_EXAMPLE)).toEqual({
      uri: MONGO_EXAMPLE,
      database: 'demo_billing_db',
    });
  });

  it('returns null for a non-mongodb URI', () => {
    expect(parseMongoConnectionString('postgres://user:pass@host/db')).toBeNull();
  });

  it('returns null when the database name is missing', () => {
    expect(parseMongoConnectionString('mongodb://host:27017')).toBeNull();
  });
});

describe('parseMssqlConnectionString', () => {
  it('accepts a classic ADO connection string verbatim', () => {
    expect(parseMssqlConnectionString(MSSQL_EXAMPLE)).toBe(MSSQL_EXAMPLE);
  });

  it('returns null for input with no key=value pairs', () => {
    expect(parseMssqlConnectionString('just some random text')).toBeNull();
  });
});

describe('parsePostgresConnectionString', () => {
  it('accepts a postgres:// URI verbatim', () => {
    expect(parsePostgresConnectionString(POSTGRES_EXAMPLE)).toBe(POSTGRES_EXAMPLE);
  });

  it('accepts a postgresql:// URI verbatim', () => {
    const uri = 'postgresql://user:pass@localhost:5432/appdb';
    expect(parsePostgresConnectionString(uri)).toBe(uri);
  });

  it('returns null for a non-postgres URI', () => {
    expect(parsePostgresConnectionString(MONGO_EXAMPLE)).toBeNull();
  });

  it('returns null for input with no scheme', () => {
    expect(parsePostgresConnectionString('just some random text')).toBeNull();
  });
});
