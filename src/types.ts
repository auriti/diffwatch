/**
 * Tipi condivisi per diffwatch
 * Usati da server, hooks e UI
 */

// --- Stato snapshot ---

export type SnapshotStatus = 'preview' | 'pending_review' | 'applied' | 'accepted' | 'rejected';

/** Decisione review gate */
export type ReviewDecision = 'approved' | 'rejected' | 'timeout';

export interface FileSnapshot {
  /** ID univoco della modifica */
  changeId: string;
  /** Path assoluto del file */
  filePath: string;
  /** Contenuto del file PRIMA della modifica */
  contentBefore: string;
  /** Contenuto del file DOPO la modifica (null se non ancora applicato) */
  contentAfter: string | null;
  /** Tool usato: Edit o Write */
  toolName: 'Edit' | 'Write';
  /** Input originale del tool (per debug) */
  toolInput: Record<string, unknown>;
  /** Timestamp della modifica */
  timestamp: number;
  /** Stato corrente della modifica */
  status: SnapshotStatus;
  /** Diff in formato unified (generato dopo applied) */
  unifiedDiff: string | null;
  /** Decisione review gate (null se non in review) */
  reviewDecision: ReviewDecision | null;
}

// --- Input hook Claude Code ---

export interface HookInput {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    command?: string;
    [key: string]: unknown;
  };
  tool_response?: Record<string, unknown>;
}

// --- API Request/Response ---

export interface SnapshotRequest {
  filePath: string;
  contentBefore: string;
  expectedAfter: string;
  toolName: 'Edit' | 'Write';
  toolInput: Record<string, unknown>;
}

export interface AppliedRequest {
  filePath: string;
  contentAfter: string;
}

export interface RollbackRequest {
  changeId: string;
}

export interface AcceptRequest {
  changeId: string;
}

export interface ReviewRequest {
  filePath: string;
  contentBefore: string;
  expectedAfter: string;
  toolName: 'Edit' | 'Write';
  toolInput: Record<string, unknown>;
}

export interface ReviewResponse {
  changeId: string;
  decision: ReviewDecision | null;
}

// --- WebSocket Messages (server → browser) ---

export type WsMessage =
  | { type: 'change:preview'; changeId: string; filePath: string; diff: string; toolName: string; timestamp: number }
  | { type: 'change:applied'; changeId: string; filePath: string; diff: string; timestamp: number }
  | { type: 'change:accepted'; changeId: string }
  | { type: 'change:rejected'; changeId: string }
  | { type: 'review:request'; changeId: string; filePath: string; diff: string; toolName: string; timestamp: number }
  | { type: 'review:decided'; changeId: string; decision: ReviewDecision }
  | { type: 'connection'; status: 'connected' };

// --- Costanti ---

export const DEFAULT_PORT = 3333;
export const MAX_PORT_RETRIES = 5;
export const HOOK_HTTP_TIMEOUT_MS = 2000;
export const WS_RECONNECT_BASE_MS = 1000;
export const WS_RECONNECT_MAX_MS = 8000;

/** Timeout review gate in ms (default 30s, configurabile via DIFFWATCH_REVIEW_TIMEOUT_MS) */
export const REVIEW_TIMEOUT_MS = 30_000;
/** Intervallo polling review in ms */
export const REVIEW_POLL_INTERVAL_MS = 500;
