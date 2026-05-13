import fs from 'node:fs/promises';
import path from 'node:path';
import type { SecurityConfig } from '../types.js';

export interface AuditEvent {
  connection: string;
  tool: string;
  operation: string;
  success: boolean;
  error?: string;
}

export async function audit(security: SecurityConfig, event: AuditEvent): Promise<void> {
  if (!security.auditLogPath) {
    return;
  }

  const logPath = path.resolve(security.auditLogPath);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(
    logPath,
    `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
    'utf8',
  );
}
