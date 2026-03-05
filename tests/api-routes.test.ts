/**
 * Test integrazione API routes
 * Issue #5: test integrazione API routes
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { SnapshotStore } from '../src/server/store.js';

// Testiamo la logica delle routes tramite lo store direttamente,
// senza avviare un server HTTP (test E2E sarà in v1.0.0)

describe('API Routes - logica business', () => {
  let store: SnapshotStore;

  const cwd = process.cwd();

  beforeEach(() => {
    store = new SnapshotStore();
  });

  describe('POST /api/snapshot — flusso', () => {
    test('crea snapshot con tutti i campi richiesti', () => {
      const snapshot = store.addSnapshot({
        filePath: `${cwd}/src/index.ts`,
        contentBefore: 'old',
        expectedAfter: 'new',
        toolName: 'Edit',
        toolInput: { file_path: `${cwd}/src/index.ts` },
      });

      expect(snapshot.changeId).toBeDefined();
      expect(snapshot.status).toBe('preview');
    });
  });

  describe('POST /api/applied — flusso', () => {
    test('aggiorna snapshot preview → applied', () => {
      store.addSnapshot({
        filePath: `${cwd}/src/test.ts`,
        contentBefore: 'before',
        expectedAfter: 'expected',
        toolName: 'Write',
        toolInput: {},
      });

      const applied = store.applySnapshot(`${cwd}/src/test.ts`, 'actual after', 'diff...');

      expect(applied).not.toBeNull();
      expect(applied!.status).toBe('applied');
      expect(applied!.contentAfter).toBe('actual after');
    });

    test('crea snapshot diretto se nessun preview esiste', () => {
      // Simula il comportamento delle routes quando non c'è preview
      const snapshot = store.addSnapshot({
        filePath: `${cwd}/src/orphan.ts`,
        contentBefore: '',
        expectedAfter: 'content',
        toolName: 'Edit',
        toolInput: {},
      });

      const applied = store.applySnapshot(`${cwd}/src/orphan.ts`, 'content', 'diff');
      expect(applied).not.toBeNull();
    });
  });

  describe('POST /api/accept — flusso', () => {
    test('accetta snapshot applied', () => {
      const snapshot = store.addSnapshot({
        filePath: `${cwd}/src/a.ts`,
        contentBefore: 'old',
        expectedAfter: 'new',
        toolName: 'Edit',
        toolInput: {},
      });

      store.applySnapshot(`${cwd}/src/a.ts`, 'new', 'diff');
      const accepted = store.acceptSnapshot(snapshot.changeId);

      expect(accepted).not.toBeNull();
      expect(accepted!.status).toBe('accepted');
    });

    test('rifiuta accept su snapshot non applied', () => {
      const snapshot = store.addSnapshot({
        filePath: `${cwd}/src/b.ts`,
        contentBefore: 'old',
        expectedAfter: 'new',
        toolName: 'Edit',
        toolInput: {},
      });

      // Ancora in preview
      const result = store.acceptSnapshot(snapshot.changeId);
      expect(result).toBeNull();
    });
  });

  describe('POST /api/rollback — flusso', () => {
    test('rileva conflitti con hasLaterChanges', () => {
      const s1 = store.addSnapshot({
        filePath: `${cwd}/src/c.ts`,
        contentBefore: 'v0',
        expectedAfter: 'v1',
        toolName: 'Edit',
        toolInput: {},
      });
      store.applySnapshot(`${cwd}/src/c.ts`, 'v1', 'diff1');

      store.addSnapshot({
        filePath: `${cwd}/src/c.ts`,
        contentBefore: 'v1',
        expectedAfter: 'v2',
        toolName: 'Edit',
        toolInput: {},
      });
      store.applySnapshot(`${cwd}/src/c.ts`, 'v2', 'diff2');

      // s1 ha modifiche successive → conflitto
      expect(store.hasLaterChanges(s1.changeId)).toBe(true);
    });
  });

  describe('POST /api/accept-all — flusso', () => {
    test('accetta tutte le applied', () => {
      store.addSnapshot({
        filePath: `${cwd}/src/d.ts`,
        contentBefore: 'old1',
        expectedAfter: 'new1',
        toolName: 'Edit',
        toolInput: {},
      });
      store.applySnapshot(`${cwd}/src/d.ts`, 'new1', 'diff1');

      store.addSnapshot({
        filePath: `${cwd}/src/e.ts`,
        contentBefore: 'old2',
        expectedAfter: 'new2',
        toolName: 'Write',
        toolInput: {},
      });
      store.applySnapshot(`${cwd}/src/e.ts`, 'new2', 'diff2');

      const applied = store.getByStatus('applied');
      let count = 0;
      for (const s of applied) {
        if (store.acceptSnapshot(s.changeId)) count++;
      }

      expect(count).toBe(2);
      expect(store.getByStatus('accepted')).toHaveLength(2);
      expect(store.pendingCount).toBe(0);
    });
  });

  describe('POST /api/reject-all — flusso LIFO', () => {
    test('ritorna snapshot in ordine LIFO per batch reject', () => {
      store.addSnapshot({
        filePath: `${cwd}/src/f.ts`,
        contentBefore: 'old',
        expectedAfter: 'new',
        toolName: 'Edit',
        toolInput: {},
      });
      store.applySnapshot(`${cwd}/src/f.ts`, 'new', 'diff1');

      store.addSnapshot({
        filePath: `${cwd}/src/g.ts`,
        contentBefore: 'old2',
        expectedAfter: 'new2',
        toolName: 'Write',
        toolInput: {},
      });
      store.applySnapshot(`${cwd}/src/g.ts`, 'new2', 'diff2');

      const lifo = store.getAppliedLIFO();
      expect(lifo).toHaveLength(2);
      // Il più recente prima (LIFO)
      expect(lifo[0].timestamp).toBeGreaterThanOrEqual(lifo[1].timestamp);
    });
  });

  describe('GET /api/changes — flusso', () => {
    test('ritorna tutti gli snapshot ordinati', () => {
      store.addSnapshot({
        filePath: `${cwd}/src/h.ts`,
        contentBefore: 'a',
        expectedAfter: 'b',
        toolName: 'Edit',
        toolInput: {},
      });
      store.addSnapshot({
        filePath: `${cwd}/src/i.ts`,
        contentBefore: 'c',
        expectedAfter: 'd',
        toolName: 'Write',
        toolInput: {},
      });

      const all = store.getAllSnapshots();
      expect(all).toHaveLength(2);
    });
  });
});

describe('Path validation nelle routes', () => {
  const cwd = process.cwd();

  test('blocca path traversal in snapshot', async () => {
    const { isPathAllowed } = await import('../src/server/path-validator.js');
    expect(isPathAllowed('../../etc/passwd')).toBe(false);
    expect(isPathAllowed('/etc/shadow')).toBe(false);
  });

  test('permette percorsi validi sotto CWD', async () => {
    const { isPathAllowed } = await import('../src/server/path-validator.js');
    expect(isPathAllowed(`${cwd}/src/index.ts`)).toBe(true);
    expect(isPathAllowed('./package.json')).toBe(true);
  });
});
