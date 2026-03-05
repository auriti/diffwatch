/**
 * Test per rate limiter e CORS
 * Issue #14 e #15
 */

import { describe, test, expect } from 'vitest';

describe('Rate limiter', () => {
  test('modulo esiste e esporta middleware', async () => {
    const mod = await import('../src/server/rate-limiter.js');
    expect(mod.rateLimitMiddleware).toBeDefined();
    expect(typeof mod.rateLimitMiddleware).toBe('function');
  });
});

describe('CORS whitelist', () => {
  test('server non contiene più wildcard CORS', async () => {
    const { readFileSync } = await import('fs');
    const serverCode = readFileSync('src/server/index.ts', 'utf-8');

    // Non deve contenere Allow-Origin: '*'
    expect(serverCode).not.toContain("'Access-Control-Allow-Origin', '*'");
  });

  test('server usa allowedOrigins', async () => {
    const { readFileSync } = await import('fs');
    const serverCode = readFileSync('src/server/index.ts', 'utf-8');

    expect(serverCode).toContain('allowedOrigins');
    expect(serverCode).toContain('localhost');
    expect(serverCode).toContain('127.0.0.1');
  });
});

describe('Store cleanup', () => {
  test('cleanup rimuove snapshot scaduti', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    // Crea snapshot e portalo a accepted
    const s = store.addSnapshot({
      filePath: `${process.cwd()}/test-cleanup.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });
    store.applySnapshot(`${process.cwd()}/test-cleanup.ts`, 'new', 'diff');
    store.acceptSnapshot(s.changeId);

    // Hack: modifica timestamp per simulare scadenza
    const snapshot = store.getSnapshot(s.changeId);
    if (snapshot) snapshot.timestamp = Date.now() - 4_000_000;

    const removed = store.cleanup(3_600_000);
    expect(removed).toBe(1);
    expect(store.getSnapshot(s.changeId)).toBeNull();
  });

  test('cleanup non rimuove snapshot applied (pending)', async () => {
    const { SnapshotStore } = await import('../src/server/store.js');
    const store = new SnapshotStore();

    const s = store.addSnapshot({
      filePath: `${process.cwd()}/test-pending.ts`,
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });
    store.applySnapshot(`${process.cwd()}/test-pending.ts`, 'new', 'diff');

    // Hack: rendi vecchio
    const snapshot = store.getSnapshot(s.changeId);
    if (snapshot) snapshot.timestamp = Date.now() - 4_000_000;

    const removed = store.cleanup(3_600_000);
    expect(removed).toBe(0);
    expect(store.getSnapshot(s.changeId)).not.toBeNull();
  });
});
