import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, fetchLatestVersion, formatUpdateNotice } from './update-check.js';

function mockRegistryResponse(versions: string[]) {
  return {
    ok: true,
    json: async () => ({
      versions: Object.fromEntries(versions.map((v) => [v, {}])),
    }),
  };
}

describe('fetchLatestVersion', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns the highest version satisfying the range', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(mockRegistryResponse(['0.1.17', '0.1.18', '0.1.19', '0.2.0']));

    const result = await fetchLatestVersion('mcp-db-connect', '^0.1.17');

    expect(result).toBe('0.1.19');
  });

  it('returns null when the registry response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });

    const result = await fetchLatestVersion('mcp-db-connect', '^0.1.17');

    expect(result).toBeNull();
  });

  it('returns null when no published version satisfies the range', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockRegistryResponse(['0.2.0', '0.3.0']));

    const result = await fetchLatestVersion('mcp-db-connect', '^0.1.17');

    expect(result).toBeNull();
  });
});

describe('checkForUpdate', () => {
  const originalFetch = globalThis.fetch;
  let cachePath: string;

  beforeEach(async () => {
    cachePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-db-update-')), 'cache.json');
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    await fs.rm(path.dirname(cachePath), { recursive: true, force: true });
  });

  it('returns update info when a newer version within range is published', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockRegistryResponse(['0.1.17', '0.1.19']));

    const result = await checkForUpdate({
      packageName: 'mcp-db-connect',
      currentVersion: '0.1.17',
      cachePath,
    });

    expect(result).toEqual({ current: '0.1.17', latest: '0.1.19' });
  });

  it('returns null when already on the latest version within range', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockRegistryResponse(['0.1.17']));

    const result = await checkForUpdate({
      packageName: 'mcp-db-connect',
      currentVersion: '0.1.17',
      cachePath,
    });

    expect(result).toBeNull();
  });

  it('ignores versions outside the safe ^current range (e.g. a new minor line)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockRegistryResponse(['0.1.17', '0.2.0']));

    const result = await checkForUpdate({
      packageName: 'mcp-db-connect',
      currentVersion: '0.1.17',
      cachePath,
    });

    expect(result).toBeNull();
  });

  it('reuses the cached result within the check interval instead of calling fetch again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockRegistryResponse(['0.1.19']));
    globalThis.fetch = fetchMock;
    const now = 1_700_000_000_000;

    await checkForUpdate({ packageName: 'mcp-db-connect', currentVersion: '0.1.17', cachePath, now });
    await checkForUpdate({
      packageName: 'mcp-db-connect',
      currentVersion: '0.1.17',
      cachePath,
      now: now + 1000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-checks once the cache interval has elapsed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockRegistryResponse(['0.1.19']));
    globalThis.fetch = fetchMock;
    const now = 1_700_000_000_000;
    const oneDayMs = 24 * 60 * 60 * 1000;

    await checkForUpdate({ packageName: 'mcp-db-connect', currentVersion: '0.1.17', cachePath, now });
    await checkForUpdate({
      packageName: 'mcp-db-connect',
      currentVersion: '0.1.17',
      cachePath,
      now: now + oneDayMs + 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never throws when the network request fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      checkForUpdate({ packageName: 'mcp-db-connect', currentVersion: '0.1.17', cachePath }),
    ).resolves.toBeNull();
  });
});

describe('formatUpdateNotice', () => {
  it('includes the current and latest version and the update command', () => {
    const notice = formatUpdateNotice({ current: '0.1.17', latest: '0.1.19' });

    expect(notice).toContain('0.1.17 -> 0.1.19');
    expect(notice).toContain('mcp-db-connect update');
  });

  it('uses a custom command name when provided', () => {
    const notice = formatUpdateNotice({ current: '0.1.17', latest: '0.1.19' }, 'npx mcp-db-connect update');

    expect(notice).toContain('npx mcp-db-connect update');
  });
});
