/**
 * Test unitari per SnapshotStore
 * Issue #2: test unitari per SnapshotStore
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { SnapshotStore } from '../src/server/store.js';

describe('SnapshotStore', () => {
  let store: SnapshotStore;

  const baseParams = {
    filePath: '/home/user/project/src/index.ts',
    contentBefore: 'const x = 1;',
    expectedAfter: 'const x = 2;',
    toolName: 'Edit' as const,
    toolInput: { file_path: '/home/user/project/src/index.ts' },
  };

  beforeEach(() => {
    store = new SnapshotStore();
  });

  // --- addSnapshot ---

  describe('addSnapshot', () => {
    test('crea snapshot con ID univoco e stato preview', () => {
      const snapshot = store.addSnapshot(baseParams);

      expect(snapshot.changeId).toBeDefined();
      expect(snapshot.changeId).toHaveLength(36); // UUID v4
      expect(snapshot.status).toBe('preview');
      expect(snapshot.filePath).toBe(baseParams.filePath);
      expect(snapshot.contentBefore).toBe(baseParams.contentBefore);
      expect(snapshot.contentAfter).toBe(baseParams.expectedAfter);
      expect(snapshot.toolName).toBe('Edit');
      expect(snapshot.timestamp).toBeGreaterThan(0);
      expect(snapshot.unifiedDiff).toBeNull();
    });

    test('genera ID univoci per snapshot diversi', () => {
      const s1 = store.addSnapshot(baseParams);
      const s2 = store.addSnapshot(baseParams);

      expect(s1.changeId).not.toBe(s2.changeId);
    });

    test('indicizza per filePath', () => {
      const s1 = store.addSnapshot(baseParams);
      const s2 = store.addSnapshot({ ...baseParams, filePath: '/other/file.ts' });

      const all = store.getAllSnapshots();
      expect(all).toHaveLength(2);
    });
  });

  // --- applySnapshot ---

  describe('applySnapshot', () => {
    test('aggiorna ultimo preview per filePath a stato applied', () => {
      store.addSnapshot(baseParams);

      const applied = store.applySnapshot(
        baseParams.filePath,
        'const x = 2;',
        'diff content'
      );

      expect(applied).not.toBeNull();
      expect(applied!.status).toBe('applied');
      expect(applied!.contentAfter).toBe('const x = 2;');
      expect(applied!.unifiedDiff).toBe('diff content');
    });

    test('ritorna null se nessun preview trovato', () => {
      const result = store.applySnapshot('/nonexistent.ts', 'content', 'diff');
      expect(result).toBeNull();
    });

    test('ritorna null se file non ha snapshot', () => {
      store.addSnapshot(baseParams);
      const result = store.applySnapshot('/different/file.ts', 'content', 'diff');
      expect(result).toBeNull();
    });

    test('applica solo l\'ultimo preview per lo stesso file', () => {
      const s1 = store.addSnapshot(baseParams);
      const s2 = store.addSnapshot(baseParams);

      const applied = store.applySnapshot(baseParams.filePath, 'new', 'diff');

      expect(applied!.changeId).toBe(s2.changeId);
      // Il primo rimane preview
      expect(store.getSnapshot(s1.changeId)!.status).toBe('preview');
    });
  });

  // --- acceptSnapshot ---

  describe('acceptSnapshot', () => {
    test('accetta snapshot in stato applied', () => {
      const snapshot = store.addSnapshot(baseParams);
      store.applySnapshot(baseParams.filePath, 'new', 'diff');

      const accepted = store.acceptSnapshot(snapshot.changeId);

      expect(accepted).not.toBeNull();
      expect(accepted!.status).toBe('accepted');
    });

    test('ritorna null per ID inesistente', () => {
      expect(store.acceptSnapshot('nonexistent')).toBeNull();
    });

    test('ritorna null se snapshot non è applied', () => {
      const snapshot = store.addSnapshot(baseParams);
      // Stato: preview (non applied)
      expect(store.acceptSnapshot(snapshot.changeId)).toBeNull();
    });
  });

  // --- rejectSnapshot ---

  describe('rejectSnapshot', () => {
    test('rifiuta snapshot in stato applied', () => {
      const snapshot = store.addSnapshot(baseParams);
      store.applySnapshot(baseParams.filePath, 'new', 'diff');

      const rejected = store.rejectSnapshot(snapshot.changeId);

      expect(rejected).not.toBeNull();
      expect(rejected!.status).toBe('rejected');
    });

    test('ritorna null per ID inesistente', () => {
      expect(store.rejectSnapshot('nonexistent')).toBeNull();
    });

    test('ritorna null se snapshot non è applied', () => {
      const snapshot = store.addSnapshot(baseParams);
      expect(store.rejectSnapshot(snapshot.changeId)).toBeNull();
    });
  });

  // --- getSnapshot ---

  describe('getSnapshot', () => {
    test('ritorna snapshot per ID valido', () => {
      const created = store.addSnapshot(baseParams);
      const found = store.getSnapshot(created.changeId);

      expect(found).not.toBeNull();
      expect(found!.changeId).toBe(created.changeId);
    });

    test('ritorna null per ID inesistente', () => {
      expect(store.getSnapshot('not-a-valid-id')).toBeNull();
    });
  });

  // --- getAllSnapshots ---

  describe('getAllSnapshots', () => {
    test('ritorna lista vuota per store vuoto', () => {
      expect(store.getAllSnapshots()).toEqual([]);
    });

    test('ordina per timestamp decrescente (più recente prima)', () => {
      const s1 = store.addSnapshot(baseParams);
      const s2 = store.addSnapshot({ ...baseParams, filePath: '/b.ts' });

      const all = store.getAllSnapshots();
      expect(all[0].timestamp).toBeGreaterThanOrEqual(all[1].timestamp);
    });
  });

  // --- getByStatus ---

  describe('getByStatus', () => {
    test('filtra per stato correttamente', () => {
      store.addSnapshot(baseParams);
      store.addSnapshot({ ...baseParams, filePath: '/b.ts' });
      store.applySnapshot(baseParams.filePath, 'new', 'diff');

      expect(store.getByStatus('preview')).toHaveLength(1);
      expect(store.getByStatus('applied')).toHaveLength(1);
      expect(store.getByStatus('accepted')).toHaveLength(0);
    });
  });

  // --- hasLaterChanges ---

  describe('hasLaterChanges', () => {
    test('ritorna false se non ci sono modifiche successive', () => {
      const snapshot = store.addSnapshot(baseParams);
      store.applySnapshot(baseParams.filePath, 'new', 'diff');

      expect(store.hasLaterChanges(snapshot.changeId)).toBe(false);
    });

    test('ritorna true se ci sono modifiche successive applied', () => {
      const s1 = store.addSnapshot(baseParams);
      store.applySnapshot(baseParams.filePath, 'v1', 'diff1');

      const s2 = store.addSnapshot(baseParams);
      store.applySnapshot(baseParams.filePath, 'v2', 'diff2');

      expect(store.hasLaterChanges(s1.changeId)).toBe(true);
      expect(store.hasLaterChanges(s2.changeId)).toBe(false);
    });

    test('ritorna false per ID inesistente', () => {
      expect(store.hasLaterChanges('nonexistent')).toBe(false);
    });
  });

  // --- getAppliedLIFO ---

  describe('getAppliedLIFO', () => {
    test('ritorna applied in ordine LIFO', () => {
      store.addSnapshot(baseParams);
      store.applySnapshot(baseParams.filePath, 'v1', 'diff1');

      store.addSnapshot({ ...baseParams, filePath: '/b.ts' });
      store.applySnapshot('/b.ts', 'v2', 'diff2');

      const lifo = store.getAppliedLIFO();
      expect(lifo).toHaveLength(2);
      // Il più recente prima
      expect(lifo[0].timestamp).toBeGreaterThanOrEqual(lifo[1].timestamp);
    });
  });

  // --- pendingCount ---

  describe('pendingCount', () => {
    test('conta solo snapshot applied', () => {
      expect(store.pendingCount).toBe(0);

      store.addSnapshot(baseParams);
      expect(store.pendingCount).toBe(0); // preview, non applied

      store.applySnapshot(baseParams.filePath, 'new', 'diff');
      expect(store.pendingCount).toBe(1);
    });
  });
});
