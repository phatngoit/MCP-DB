export interface OracleParsedConnectionString {
  username: string;
  password?: string;
  connectDescriptor: string;
}

export interface MongoParsedConnectionString {
  uri: string;
  database: string;
}

export function parseOracleConnectionString(input: string): OracleParsedConnectionString | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/data\s*source\s*=/i.test(trimmed)) {
    return parseOdpNetConnectionString(trimmed);
  }

  return parseOracleEasyConnect(trimmed);
}

function parseOdpNetConnectionString(input: string): OracleParsedConnectionString | null {
  const pairs = new Map<string, string>();
  for (const segment of input.split(';')) {
    const trimmedSegment = segment.trim();
    if (!trimmedSegment) continue;
    const eqIndex = trimmedSegment.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmedSegment.slice(0, eqIndex).trim().replace(/\s+/g, '').toLowerCase();
    const value = trimmedSegment.slice(eqIndex + 1).trim();
    pairs.set(key, value);
  }

  const connectDescriptor = pairs.get('datasource');
  const username = pairs.get('userid') ?? pairs.get('uid');
  const password = pairs.get('password') ?? pairs.get('pwd');
  if (!connectDescriptor || !username) {
    return null;
  }

  return { username, password: password || undefined, connectDescriptor };
}

function parseOracleEasyConnect(input: string): OracleParsedConnectionString | null {
  const match = input.match(/^([^/@]+)\/([^@]*)@(.+)$/);
  if (!match) {
    return null;
  }

  const [, username, password, connectDescriptor] = match;
  const trimmedUsername = username.trim();
  const trimmedDescriptor = connectDescriptor.trim();
  if (!trimmedUsername || !trimmedDescriptor) {
    return null;
  }

  return {
    username: trimmedUsername,
    password: password.trim() || undefined,
    connectDescriptor: trimmedDescriptor,
  };
}

export function extractMongoDatabaseName(uri: string): string | null {
  const schemeEnd = uri.indexOf('://');
  if (schemeEnd === -1) {
    return null;
  }

  const afterScheme = uri.slice(schemeEnd + 3);
  const pathStart = afterScheme.indexOf('/');
  if (pathStart === -1) {
    return null;
  }

  const database = afterScheme.slice(pathStart + 1).split('?')[0].trim();
  return database || null;
}

export function parseMongoConnectionString(uri: string): MongoParsedConnectionString | null {
  const trimmed = uri.trim();
  if (!/^mongodb(\+srv)?:\/\//i.test(trimmed)) {
    return null;
  }

  const database = extractMongoDatabaseName(trimmed);
  if (!database) {
    return null;
  }

  return { uri: trimmed, database };
}

export function parseMssqlConnectionString(input: string): string | null {
  const trimmed = input.trim();
  const looksValid = /[A-Za-z][A-Za-z0-9 ]*=[^;]+/.test(trimmed);
  return looksValid ? trimmed : null;
}
