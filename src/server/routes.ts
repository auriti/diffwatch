/**
 * API Routes per diffwatch
 * Gestisce snapshot, applied, rollback, accept
 */

import { Router } from 'express';
import { store } from './store.js';
import { broadcast } from './websocket.js';
import { createUnifiedDiff } from '../diff/engine.js';
import { rollbackFile } from '../diff/rollback.js';
import type { SnapshotRequest, AppliedRequest, RollbackRequest, AcceptRequest } from '../types.js';

export const router = Router();

/**
 * POST /api/snapshot — Chiamato dal hook PreToolUse
 * Salva lo snapshot del file prima della modifica
 */
router.post('/api/snapshot', (req, res) => {
  try {
    const body = req.body as SnapshotRequest;

    if (!body.filePath || body.contentBefore === undefined) {
      res.status(400).json({ error: 'filePath e contentBefore richiesti' });
      return;
    }

    const snapshot = store.addSnapshot({
      filePath: body.filePath,
      contentBefore: body.contentBefore,
      expectedAfter: body.expectedAfter || '',
      toolName: body.toolName || 'Edit',
      toolInput: body.toolInput || {},
    });

    // Genera diff preview se abbiamo expectedAfter
    if (body.expectedAfter) {
      snapshot.unifiedDiff = createUnifiedDiff(
        body.filePath,
        body.contentBefore,
        body.expectedAfter
      );

      // Broadcast preview ai client
      broadcast({
        type: 'change:preview',
        changeId: snapshot.changeId,
        filePath: snapshot.filePath,
        diff: snapshot.unifiedDiff,
        toolName: snapshot.toolName,
        timestamp: snapshot.timestamp,
      });
    }

    res.json({ changeId: snapshot.changeId });
  } catch (err) {
    console.error('[diffwatch] Errore snapshot:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

/**
 * POST /api/applied — Chiamato dal hook PostToolUse
 * Aggiorna lo snapshot con il contenuto reale dopo la modifica
 */
router.post('/api/applied', (req, res) => {
  try {
    const body = req.body as AppliedRequest;

    if (!body.filePath || body.contentAfter === undefined) {
      res.status(400).json({ error: 'filePath e contentAfter richiesti' });
      return;
    }

    // Trova l'ultimo snapshot preview per questo file
    const allSnapshots = store.getAllSnapshots();
    const previewSnapshot = allSnapshots.find(
      s => s.filePath === body.filePath && s.status === 'preview'
    );

    if (!previewSnapshot) {
      // Nessun preview trovato — crea uno snapshot completo direttamente
      const snapshot = store.addSnapshot({
        filePath: body.filePath,
        contentBefore: '', // Non abbiamo il before
        expectedAfter: body.contentAfter,
        toolName: 'Edit',
        toolInput: {},
      });

      const diff = createUnifiedDiff(body.filePath, '', body.contentAfter);
      store.applySnapshot(body.filePath, body.contentAfter, diff);

      broadcast({
        type: 'change:applied',
        changeId: snapshot.changeId,
        filePath: body.filePath,
        diff,
        timestamp: snapshot.timestamp,
      });

      res.json({ changeId: snapshot.changeId, diff });
      return;
    }

    // Genera diff con il contenuto reale
    const diff = createUnifiedDiff(
      body.filePath,
      previewSnapshot.contentBefore,
      body.contentAfter
    );

    const updated = store.applySnapshot(body.filePath, body.contentAfter, diff);

    if (updated) {
      broadcast({
        type: 'change:applied',
        changeId: updated.changeId,
        filePath: body.filePath,
        diff,
        timestamp: updated.timestamp,
      });
    }

    res.json({ changeId: updated?.changeId || null, diff });
  } catch (err) {
    console.error('[diffwatch] Errore applied:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

/**
 * POST /api/rollback — Chiamato dal browser
 * Ripristina il file al contenuto precedente
 */
router.post('/api/rollback', (req, res) => {
  try {
    const body = req.body as RollbackRequest;

    if (!body.changeId) {
      res.status(400).json({ error: 'changeId richiesto' });
      return;
    }

    const snapshot = store.getSnapshot(body.changeId);
    if (!snapshot) {
      res.status(404).json({ error: 'Snapshot non trovato' });
      return;
    }

    if (snapshot.status !== 'applied') {
      res.status(400).json({ error: `Snapshot non rollbackabile (status: ${snapshot.status})` });
      return;
    }

    // Verifica conflitti con modifiche successive
    if (store.hasLaterChanges(body.changeId)) {
      res.status(409).json({
        error: 'Conflitto: ci sono modifiche successive a questo file. Effettua prima il rollback delle modifiche più recenti.',
      });
      return;
    }

    // Esegui il rollback sul filesystem
    const result = rollbackFile(snapshot);

    if (!result.success) {
      const status = result.conflict ? 409 : 500;
      res.status(status).json({ error: result.message, conflict: result.conflict });
      return;
    }

    // Marca come rejected
    store.rejectSnapshot(body.changeId);

    broadcast({ type: 'change:rejected', changeId: body.changeId });

    res.json({ success: true, message: result.message });
  } catch (err) {
    console.error('[diffwatch] Errore rollback:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

/**
 * POST /api/accept — Chiamato dal browser
 * Marca una modifica come accettata (noop sul filesystem)
 */
router.post('/api/accept', (req, res) => {
  try {
    const body = req.body as AcceptRequest;

    if (!body.changeId) {
      res.status(400).json({ error: 'changeId richiesto' });
      return;
    }

    const snapshot = store.acceptSnapshot(body.changeId);
    if (!snapshot) {
      res.status(404).json({ error: 'Snapshot non trovato o non in stato applied' });
      return;
    }

    broadcast({ type: 'change:accepted', changeId: body.changeId });

    res.json({ success: true });
  } catch (err) {
    console.error('[diffwatch] Errore accept:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

/**
 * POST /api/accept-all — Accetta tutte le modifiche pending
 */
router.post('/api/accept-all', (_req, res) => {
  try {
    const applied = store.getByStatus('applied');
    let count = 0;

    for (const snapshot of applied) {
      const accepted = store.acceptSnapshot(snapshot.changeId);
      if (accepted) {
        broadcast({ type: 'change:accepted', changeId: snapshot.changeId });
        count++;
      }
    }

    res.json({ success: true, count });
  } catch (err) {
    console.error('[diffwatch] Errore accept-all:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

/**
 * POST /api/reject-all — Rollback di tutte le modifiche pending (ordine LIFO)
 */
router.post('/api/reject-all', (_req, res) => {
  try {
    const applied = store.getAppliedLIFO();
    let count = 0;
    const conflicts: string[] = [];

    for (const snapshot of applied) {
      const result = rollbackFile(snapshot);
      if (result.success) {
        store.rejectSnapshot(snapshot.changeId);
        broadcast({ type: 'change:rejected', changeId: snapshot.changeId });
        count++;
      } else {
        conflicts.push(`${snapshot.filePath}: ${result.message}`);
      }
    }

    res.json({ success: true, count, conflicts });
  } catch (err) {
    console.error('[diffwatch] Errore reject-all:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});

/**
 * GET /api/changes — Lista tutte le modifiche
 */
router.get('/api/changes', (_req, res) => {
  try {
    const snapshots = store.getAllSnapshots();
    res.json(snapshots);
  } catch (err) {
    console.error('[diffwatch] Errore changes:', err);
    res.status(500).json({ error: 'Errore interno' });
  }
});
