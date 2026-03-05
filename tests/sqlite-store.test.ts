/**
 * Test per SqliteStore — persistenza su SQLite
 * Issue #9
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Helper: crea un store SQLite con DB temporaneo
async function createTestStore() {
  const { SqliteStore } = await import('../src/server/sqlite-store.js');
  const tmpDir = mkdtempSync(join(tmpdir(), 'diffwatch-test-'));
  const dbPath = join(tmpDir, 'test.db');
  const store = new SqliteStore(dbPath);
  return { store, tmpDir, dbPath };
}

describe('SqliteStore — CRUD base', () => {
  let store: Awaited<ReturnType<typeof createTestStore>>['store'];
  let tmpDir: string;

  beforeEach(async () => {
    const ctx = await createTestStore();
    store = ctx.store;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('addSnapshot crea e ritorna snapshot', () => {
    const s = store.addSnapshot({
      filePath: '/test/file.ts',
      contentBefore: 'old content',
      expectedAfter: 'new content',
      toolName: 'Edit',
      toolInput: { key: 'value' },
    });

    expect(s.changeId).toBeDefined();
    expect(s.filePath).toBe('/test/file.ts');
    expect(s.contentBefore).toBe('old content');
    expect(s.status).toBe('preview');
    expect(s.reviewDecision).toBeNull();
  });

  test('getSnapshot recupera per ID', () => {
    const s = store.addSnapshot({
      filePath: '/test/file.ts',
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    const found = store.getSnapshot(s.changeId);
    expect(found).not.toBeNull();
    expect(found!.changeId).toBe(s.changeId);
    expect(found!.filePath).toBe('/test/file.ts');
  });

  test('getSnapshot ritorna null per ID inesistente', () => {
    expect(store.getSnapshot('non-esiste')).toBeNull();
  });

  test('getAllSnapshots ritorna tutti ordinati per timestamp desc', () => {
    store.addSnapshot({ filePath: '/a.ts', contentBefore: '', expectedAfter: '', toolName: 'Edit', toolInput: {} });
    store.addSnapshot({ filePath: '/b.ts', contentBefore: '', expectedAfter: '', toolName: 'Write', toolInput: {} });

    const all = store.getAllSnapshots();
    expect(all.length).toBe(2);
    expect(all[0].timestamp).toBeGreaterThanOrEqual(all[1].timestamp);
  });
});

describe('SqliteStore — Lifecycle', () => {
  let store: Awaited<ReturnType<typeof createTestStore>>['store'];
  let tmpDir: string;

  beforeEach(async () => {
    const ctx = await createTestStore();
    store = ctx.store;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('applySnapshot aggiorna preview → applied', () => {
    store.addSnapshot({
      filePath: '/test/apply.ts',
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });

    const applied = store.applySnapshot('/test/apply.ts', 'actual new', 'diff here');
    expect(applied).not.toBeNull();
    expect(applied!.status).toBe('applied');
    expect(applied!.contentAfter).toBe('actual new');
    expect(applied!.unifiedDiff).toBe('diff here');
  });

  test('acceptSnapshot marca come accepted', () => {
    const s = store.addSnapshot({
      filePath: '/test/accept.ts',
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });
    store.applySnapshot('/test/accept.ts', 'new', 'diff');

    const accepted = store.acceptSnapshot(s.changeId);
    expect(accepted).not.toBeNull();
    expect(accepted!.status).toBe('accepted');
  });

  test('rejectSnapshot marca come rejected', () => {
    const s = store.addSnapshot({
      filePath: '/test/reject.ts',
      contentBefore: 'old',
      expectedAfter: 'new',
      toolName: 'Edit',
      toolInput: {},
    });
    store.applySnapshot('/test/reject.ts', 'new', 'diff');

    const rejected = store.rejectSnapshot(s.changeId);
    expect(rejected).not.toBeNull();
    expect(rejected!.status).toBe('rejected');
  });

  test('getByStatus filtra correttamente', () => {
    const s1 = store.addSnapshot({ filePath: '/a.ts', contentBefore: '', expectedAfter: '', toolName: 'Edit', toolInput: {} });
    store.addSnapshot({ filePath: '/b.ts', contentBefore: '', expectedAfter: '', toolName: 'Edit', toolInput: {} });
    store.applySnapshot('/a.ts', 'new', 'diff');
    store.applySnapshot('/b.ts', 'new', 'diff');
    store.acceptSnapshot(s1.changeId);

    expect(store.getByStatus('accepted').length).toBe(1);
    expect(store.getByStatus('applied').length).toBe(1);
    expect(store.getByStatus('preview').length).toBe(0);
  });

  test('hasLaterChanges rileva modifiche successive', () => {
    const s1 = store.addSnapshot({ filePath: '/same.ts', contentBefore: 'v1', expectedAfter: 'v2', toolName: 'Edit', toolInput: {} });
    store.applySnapshot('/same.ts', 'v2', 'diff1');

    const s2 = store.addSnapshot({ filePath: '/same.ts', contentBefore: 'v2', expectedAfter: 'v3', toolName: 'Edit', toolInput: {} });
    store.applySnapshot('/same.ts', 'v3', 'diff2');

    expect(store.hasLaterChanges(s1.changeId)).toBe(true);
    expect(store.hasLaterChanges(s2.changeId)).toBe(false);
  });

  test('pendingCount conta solo applied', () => {
    store.addSnapshot({ filePath: '/a.ts', contentBefore: '', expectedAfter: '', toolName: 'Edit', toolInput: {} });
    store.applySnapshot('/a.ts', 'new', 'diff');

    store.addSnapshot({ filePath: '/b.ts', contentBefore: '', expectedAfter: '', toolName: 'Edit', toolInput: {} });

    expect(store.pendingCount).toBe(1);
  });
});

describe('SqliteStore — Review gate', () => {
  let store: Awaited<ReturnType<typeof createTestStore>>['store'];
  let tmpDir: string;

  beforeEach(async () => {
    const ctx = await createTestStore();
    store = ctx.store;
    tmpDir = ctx.tmpDir;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('requestReview porta a pending_review', () => {
    const s = store.addSnapshot({ filePath: '/r.ts', contentBefore: 'old', expectedAfter: 'new', toolName: 'Edit', toolInput: {} });
    const reviewed = store.requestReview(s.changeId);

    expect(reviewed!.status).toBe('pending_review');
  });

  test('setReviewDecision approved mantiene pending_review', () => {
    const s = store.addSnapshot({ filePath: '/r2.ts', contentBefore: 'old', expectedAfter: 'new', toolName: 'Edit', toolInput: {} });
    store.requestReview(s.changeId);
    const decided = store.setReviewDecision(s.changeId, 'approved');

    expect(decided!.reviewDecision).toBe('approved');
    expect(decided!.status).toBe('pending_review');
  });

  test('setReviewDecision rejected cambia status', () => {
    const s = store.addSnapshot({ filePath: '/r3.ts', contentBefore: 'old', expectedAfter: 'new', toolName: 'Edit', toolInput: {} });
    store.requestReview(s.changeId);
    const decided = store.setReviewDecision(s.changeId, 'rejected');

    expect(decided!.reviewDecision).toBe('rejected');
    expect(decided!.status).toBe('rejected');
  });
});

describe('SqliteStore — Cleanup', () => {
  let store: Awaited<ReturnType<typeof createTestStore>>['store'];
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    const ctx = await createTestStore();
    store = ctx.store;
    tmpDir = ctx.tmpDir;
    dbPath = ctx.dbPath;
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('cleanup rimuove snapshot scaduti', () => {
    const s = store.addSnapshot({ filePath: '/c.ts', contentBefore: 'old', expectedAfter: 'new', toolName: 'Edit', toolInput: {} });
    store.applySnapshot('/c.ts', 'new', 'diff');
    store.acceptSnapshot(s.changeId);

    // Cleanup con TTL 0 (rimuove tutto)
    const removed = store.cleanup(0);
    expect(removed).toBe(1);
    expect(store.getSnapshot(s.changeId)).toBeNull();
  });

  test('cleanup non rimuove applied', () => {
    store.addSnapshot({ filePath: '/c2.ts', contentBefore: 'old', expectedAfter: 'new', toolName: 'Edit', toolInput: {} });
    store.applySnapshot('/c2.ts', 'new', 'diff');

    const removed = store.cleanup(0);
    expect(removed).toBe(0);
  });

  test('persistenza: dati sopravvivono a riconnessione', async () => {
    const s = store.addSnapshot({ filePath: '/persist.ts', contentBefore: 'old', expectedAfter: 'new', toolName: 'Edit', toolInput: {} });
    store.applySnapshot('/persist.ts', 'new', 'diff');

    // Chiudi e riapri
    store.close();

    const { SqliteStore } = await import('../src/server/sqlite-store.js');
    const store2 = new SqliteStore(dbPath);

    const found = store2.getSnapshot(s.changeId);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('applied');
    expect(found!.filePath).toBe('/persist.ts');

    store2.close();
  });
});
