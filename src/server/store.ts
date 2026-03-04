/**
 * SnapshotStore — Gestione stato in memoria
 * Salva gli snapshot dei file modificati per visualizzazione diff
 */

import { randomUUID } from 'crypto';
import type { FileSnapshot, SnapshotStatus } from '../types.js';

export class SnapshotStore {
  /** Tutti gli snapshot, indicizzati per changeId */
  private snapshots = new Map<string, FileSnapshot>();

  /** Indice per filePath → lista changeId (ordine cronologico) */
  private byFile = new Map<string, string[]>();

  /**
   * Crea un nuovo snapshot (chiamato da PreToolUse hook)
   * Ritorna il changeId generato
   */
  addSnapshot(params: {
    filePath: string;
    contentBefore: string;
    expectedAfter: string;
    toolName: 'Edit' | 'Write';
    toolInput: Record<string, unknown>;
  }): FileSnapshot {
    const changeId = randomUUID();
    const snapshot: FileSnapshot = {
      changeId,
      filePath: params.filePath,
      contentBefore: params.contentBefore,
      contentAfter: params.expectedAfter,
      toolName: params.toolName,
      toolInput: params.toolInput,
      timestamp: Date.now(),
      status: 'preview',
      unifiedDiff: null,
    };

    this.snapshots.set(changeId, snapshot);

    // Aggiungi all'indice per file
    const fileChanges = this.byFile.get(params.filePath) || [];
    fileChanges.push(changeId);
    this.byFile.set(params.filePath, fileChanges);

    return snapshot;
  }

  /**
   * Aggiorna uno snapshot con il contenuto reale dopo l'applicazione (PostToolUse)
   * Cerca l'ultimo snapshot per quel filePath con status 'preview'
   */
  applySnapshot(filePath: string, contentAfter: string, unifiedDiff: string): FileSnapshot | null {
    const fileChanges = this.byFile.get(filePath);
    if (!fileChanges || fileChanges.length === 0) return null;

    // Cerca l'ultimo snapshot in stato 'preview' per questo file
    for (let i = fileChanges.length - 1; i >= 0; i--) {
      const snapshot = this.snapshots.get(fileChanges[i]);
      if (snapshot && snapshot.status === 'preview') {
        snapshot.contentAfter = contentAfter;
        snapshot.unifiedDiff = unifiedDiff;
        snapshot.status = 'applied';
        return snapshot;
      }
    }

    return null;
  }

  /**
   * Marca uno snapshot come accettato
   */
  acceptSnapshot(changeId: string): FileSnapshot | null {
    const snapshot = this.snapshots.get(changeId);
    if (!snapshot) return null;
    if (snapshot.status !== 'applied') return null;
    snapshot.status = 'accepted';
    return snapshot;
  }

  /**
   * Marca uno snapshot come rifiutato
   * Ritorna lo snapshot per il rollback (il chiamante deve scrivere il file)
   */
  rejectSnapshot(changeId: string): FileSnapshot | null {
    const snapshot = this.snapshots.get(changeId);
    if (!snapshot) return null;
    if (snapshot.status !== 'applied') return null;
    snapshot.status = 'rejected';
    return snapshot;
  }

  /**
   * Ritorna uno snapshot per ID
   */
  getSnapshot(changeId: string): FileSnapshot | null {
    return this.snapshots.get(changeId) || null;
  }

  /**
   * Ritorna tutti gli snapshot, ordinati per timestamp (più recente prima)
   */
  getAllSnapshots(): FileSnapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Ritorna gli snapshot con un dato stato
   */
  getByStatus(status: SnapshotStatus): FileSnapshot[] {
    return this.getAllSnapshots().filter(s => s.status === status);
  }

  /**
   * Verifica se ci sono modifiche successive allo snapshot dato
   * (per rilevare conflitti di rollback)
   */
  hasLaterChanges(changeId: string): boolean {
    const snapshot = this.snapshots.get(changeId);
    if (!snapshot) return false;

    const fileChanges = this.byFile.get(snapshot.filePath);
    if (!fileChanges) return false;

    const idx = fileChanges.indexOf(changeId);
    if (idx === -1) return false;

    // Controlla se ci sono snapshot successivi applicati
    for (let i = idx + 1; i < fileChanges.length; i++) {
      const later = this.snapshots.get(fileChanges[i]);
      if (later && (later.status === 'applied' || later.status === 'accepted')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Ritorna tutti gli snapshot 'applied' in ordine LIFO (per batch reject)
   */
  getAppliedLIFO(): FileSnapshot[] {
    return this.getByStatus('applied')
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Numero totale di snapshot pending (applied, non ancora decisi)
   */
  get pendingCount(): number {
    return this.getByStatus('applied').length;
  }
}

/** Istanza singleton dello store */
export const store = new SnapshotStore();
