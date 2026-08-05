import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';

export interface UpdateInfo {
  current: string;
  latest: string;
}

interface UpdateCache {
  checkedAt: number;
  latest: string | null;
}

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2000;

export function defaultCachePath(): string {
  return path.join(os.homedir(), '.mcp-db-connect', 'update-check.json');
}

export interface CheckForUpdateOptions {
  packageName: string;
  currentVersion: string;
  registryUrl?: string;
  cachePath?: string;
  now?: number;
}

/**
 * Background-safe update check: cached (once per CHECK_INTERVAL_MS) and never
 * throws, so it's safe to call without awaiting from a running MCP server.
 */
export async function checkForUpdate(options: CheckForUpdateOptions): Promise<UpdateInfo | null> {
  const cachePath = options.cachePath ?? defaultCachePath();
  const now = options.now ?? Date.now();

  try {
    const cached = await readCache(cachePath);
    if (cached && now - cached.checkedAt < CHECK_INTERVAL_MS) {
      return toUpdateInfo(options.currentVersion, cached.latest);
    }

    const latest = await fetchLatestVersion(
      options.packageName,
      `^${options.currentVersion}`,
      options.registryUrl,
    );
    await writeCache(cachePath, { checkedAt: now, latest });
    return toUpdateInfo(options.currentVersion, latest);
  } catch {
    return null;
  }
}

/**
 * Live (uncached) lookup of the highest published version satisfying `range`.
 * Used directly by the `update` command, which always wants a fresh answer.
 */
export async function fetchLatestVersion(
  packageName: string,
  range: string,
  registryUrl?: string,
): Promise<string | null> {
  const url = registryUrl ?? `https://registry.npmjs.org/${packageName}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { versions?: Record<string, unknown> };
    const versions = Object.keys(data.versions ?? {});
    return semver.maxSatisfying(versions, range);
  } finally {
    clearTimeout(timeout);
  }
}

export function formatUpdateNotice(info: UpdateInfo, command = 'mcp-db-connect update'): string {
  return [
    '',
    `[mcp-db-connect] Update available: ${info.current} -> ${info.latest}`,
    `  Run "${command}" to update, or "npm install -g mcp-db-connect@${info.latest}".`,
    '',
  ].join('\n');
}

function toUpdateInfo(currentVersion: string, latest: string | null): UpdateInfo | null {
  if (!latest || !semver.gt(latest, currentVersion)) {
    return null;
  }
  return { current: currentVersion, latest };
}

async function readCache(cachePath: string): Promise<UpdateCache | null> {
  try {
    const raw = await fs.readFile(cachePath, 'utf8');
    return JSON.parse(raw) as UpdateCache;
  } catch {
    return null;
  }
}

async function writeCache(cachePath: string, cache: UpdateCache): Promise<void> {
  await fs.mkdir(path.dirname(cachePath), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(cache), 'utf8');
}
