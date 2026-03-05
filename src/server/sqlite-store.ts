/**
 * SqliteStore — Persistenza snapshot su SQLite
 * Sostituisce lo store in-memoria per persistere tra riavvii del server
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync } from 'fs';
import type { FileSnapshot, SnapshotStatus, ReviewDecision } from '../types.js';

/** Percorso database (configurabile via env) */
function getDbPath(): string {
  const custom = process.env.DIFFWATCH_DB_PATH;
  if (custom) return custom;

  const dir = join(homedir(), '.diffwatch');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'snapshots.db');
}

export class SqliteStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    this.db = new Database(dbPath || getDbPath());
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  /** Crea tabelle e indici */
  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        change_id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        content_before TEXT NOT NULL DEFAULT '',
        content_after TEXT,
        tool_name TEXT NOT NULL DEFAULT 'Edit',
        tool_input TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'preview',
        unified_diff TEXT,
        review_decision TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_file_path ON snapshots(file_path);
      CREATE INDEX IF NOT EXISTS idx_snapshots_status ON snapshots(status);
      CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON snapshots(timestamp);
    `);
  }

  /** Converte una riga DB in FileSnapshot */
  private rowToSnapshot(row: Record<string, unknown>): FileSnapshot {
    return {
      changeId: row.change_id as string,
      filePath: row.file_path as string,
      contentBefore: row.content_before as string,
      contentAfter: (row.content_after as string) || null,
      toolName: (row.tool_name as 'Edit' | 'Write') || 'Edit',
      toolInput: JSON.parse((row.tool_input as string) || '{}'),
      timestamp: row.timestamp as number,
      status: row.status as SnapshotStatus,
      unifiedDiff: (row.unified_diff as string) || null,
      reviewDecision: (row.review_decision as ReviewDecision) || null,
    };
  }

  addSnapshot(params: {
    filePath: string;
    contentBefore: string;
    expectedAfter: string;
    toolName: 'Edit' | 'Write';
    toolInput: Record<string, unknown>;
  }): FileSnapshot {
    const changeId = randomUUID();
    const timestamp = Date.now();

    this.db.prepare(`
      INSERT INTO snapshots (change_id, file_path, content_before, content_after, tool_name, tool_input, timestamp, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'preview')
    `).run(
      changeId,
      params.filePath,
      params.contentBefore,
      params.expectedAfter,
      params.toolName,
      JSON.stringify(params.toolInput),
      timestamp
    );

    return {
      changeId,
      filePath: params.filePath,
      contentBefore: params.contentBefore,
      contentAfter: params.expectedAfter,
      toolName: params.toolName,
      toolInput: params.toolInput,
      timestamp,
      status: 'preview',
      unifiedDiff: null,
      reviewDecision: null,
    };
  }

  applySnapshot(filePath: string, contentAfter: string, unifiedDiff: string): FileSnapshot | null {
    // Cerca l'ultimo snapshot preview per questo file
    const row = this.db.prepare(`
      SELECT * FROM snapshots
      WHERE file_path = ? AND status = 'preview'
      ORDER BY timestamp DESC LIMIT 1
    `).get(filePath) as Record<string, unknown> | undefined;

    if (!row) return null;

    this.db.prepare(`
      UPDATE snapshots SET content_after = ?, unified_diff = ?, status = 'applied'
      WHERE change_id = ?
    `).run(contentAfter, unifiedDiff, row.change_id);

    return this.getSnapshot(row.change_id as string);
  }

  acceptSnapshot(changeId: string): FileSnapshot | null {
    const snapshot = this.getSnapshot(changeId);
    if (!snapshot || snapshot.status !== 'applied') return null;

    this.db.prepare(`UPDATE snapshots SET status = 'accepted' WHERE change_id = ?`).run(changeId);
    return { ...snapshot, status: 'accepted' };
  }

  rejectSnapshot(changeId: string): FileSnapshot | null {
    const snapshot = this.getSnapshot(changeId);
    if (!snapshot || snapshot.status !== 'applied') return null;

    this.db.prepare(`UPDATE snapshots SET status = 'rejected' WHERE change_id = ?`).run(changeId);
    return { ...snapshot, status: 'rejected' };
  }

  getSnapshot(changeId: string): FileSnapshot | null {
    const row = this.db.prepare(`SELECT * FROM snapshots WHERE change_id = ?`).get(changeId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToSnapshot(row);
  }

  getAllSnapshots(): FileSnapshot[] {
    const rows = this.db.prepare(`SELECT * FROM snapshots ORDER BY timestamp DESC`).all() as Record<string, unknown>[];
    return rows.map(r => this.rowToSnapshot(r));
  }

  getByStatus(status: SnapshotStatus): FileSnapshot[] {
    const rows = this.db.prepare(`SELECT * FROM snapshots WHERE status = ? ORDER BY timestamp DESC`).all(status) as Record<string, unknown>[];
    return rows.map(r => this.rowToSnapshot(r));
  }

  hasLaterChanges(changeId: string): boolean {
    const snapshot = this.getSnapshot(changeId);
    if (!snapshot) return false;

    const count = this.db.prepare(`
      SELECT COUNT(*) as cnt FROM snapshots
      WHERE file_path = ? AND change_id != ? AND timestamp >= ? AND status IN ('applied', 'accepted')
    `).get(snapshot.filePath, changeId, snapshot.timestamp) as { cnt: number };

    return count.cnt > 0;
  }

  getAppliedLIFO(): FileSnapshot[] {
    return this.getByStatus('applied');
  }

  get pendingCount(): number {
    const result = this.db.prepare(`SELECT COUNT(*) as cnt FROM snapshots WHERE status = 'applied'`).get() as { cnt: number };
    return result.cnt;
  }

  /** Review gate */
  requestReview(changeId: string): FileSnapshot | null {
    const snapshot = this.getSnapshot(changeId);
    if (!snapshot || snapshot.status !== 'preview') return null;

    this.db.prepare(`UPDATE snapshots SET status = 'pending_review' WHERE change_id = ?`).run(changeId);
    return { ...snapshot, status: 'pending_review' };
  }

  setReviewDecision(changeId: string, decision: ReviewDecision): FileSnapshot | null {
    const snapshot = this.getSnapshot(changeId);
    if (!snapshot || snapshot.status !== 'pending_review') return null;

    const newStatus = decision === 'rejected' ? 'rejected' : 'pending_review';
    this.db.prepare(`UPDATE snapshots SET review_decision = ?, status = ? WHERE change_id = ?`)
      .run(decision, newStatus, changeId);

    return { ...snapshot, reviewDecision: decision, status: newStatus as SnapshotStatus };
  }

  getReviewDecision(changeId: string): ReviewDecision | null {
    const snapshot = this.getSnapshot(changeId);
    return snapshot?.reviewDecision || null;
  }

  cleanup(ttlMs: number = 3_600_000): number {
    const cutoff = Date.now() - ttlMs;
    const result = this.db.prepare(`
      DELETE FROM snapshots
      WHERE status IN ('accepted', 'rejected') AND timestamp < ?
    `).run(cutoff);
    return result.changes;
  }

  /** Chiudi la connessione DB */
  close(): void {
    this.db.close();
  }
}
