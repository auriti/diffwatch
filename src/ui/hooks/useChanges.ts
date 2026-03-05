/**
 * Hook React per gestire lo stato delle modifiche
 */

import { useReducer, useCallback, useEffect } from 'react';
import type { FileSnapshot, WsMessage } from '../../types.js';

// Stato globale delle modifiche
interface ChangesState {
  /** Tutte le modifiche, indicizzate per changeId */
  changes: Map<string, FileSnapshot>;
  /** changeId selezionato nella UI */
  selectedId: string | null;
}

type ChangesAction =
  | { type: 'LOAD_ALL'; changes: FileSnapshot[] }
  | { type: 'ADD_PREVIEW'; change: Partial<FileSnapshot> & { changeId: string } }
  | { type: 'ADD_REVIEW'; change: Partial<FileSnapshot> & { changeId: string } }
  | { type: 'REVIEW_DECIDED'; changeId: string; decision: string }
  | { type: 'APPLY'; changeId: string; diff: string }
  | { type: 'ACCEPT'; changeId: string }
  | { type: 'REJECT'; changeId: string }
  | { type: 'SELECT'; changeId: string | null };

function changesReducer(state: ChangesState, action: ChangesAction): ChangesState {
  const changes = new Map(state.changes);

  switch (action.type) {
    case 'LOAD_ALL': {
      const newMap = new Map<string, FileSnapshot>();
      for (const c of action.changes) {
        newMap.set(c.changeId, c);
      }
      // Seleziona l'ultima modifica applied se nessuna selezionata
      const applied = action.changes.filter(c => c.status === 'applied');
      const selectedId = applied.length > 0 ? applied[0].changeId : null;
      return { changes: newMap, selectedId: state.selectedId || selectedId };
    }

    case 'ADD_PREVIEW': {
      const existing = changes.get(action.change.changeId);
      const snapshot: FileSnapshot = existing ? { ...existing, ...action.change } : {
        changeId: action.change.changeId,
        filePath: action.change.filePath || '',
        contentBefore: '',
        contentAfter: null,
        toolName: (action.change.toolName as 'Edit' | 'Write') || 'Edit',
        toolInput: {},
        timestamp: action.change.timestamp || Date.now(),
        status: 'preview',
        unifiedDiff: action.change.unifiedDiff || null,
      };
      changes.set(action.change.changeId, snapshot);
      return { changes, selectedId: action.change.changeId };
    }

    case 'ADD_REVIEW': {
      const existing = changes.get(action.change.changeId);
      const snapshot: FileSnapshot = existing ? { ...existing, ...action.change, status: 'pending_review' } : {
        changeId: action.change.changeId,
        filePath: action.change.filePath || '',
        contentBefore: '',
        contentAfter: null,
        toolName: (action.change.toolName as 'Edit' | 'Write') || 'Edit',
        toolInput: {},
        timestamp: action.change.timestamp || Date.now(),
        status: 'pending_review',
        unifiedDiff: action.change.unifiedDiff || null,
        reviewDecision: null,
      };
      changes.set(action.change.changeId, snapshot);
      return { changes, selectedId: action.change.changeId };
    }

    case 'REVIEW_DECIDED': {
      const snapshot = changes.get(action.changeId);
      if (snapshot) {
        changes.set(action.changeId, {
          ...snapshot,
          reviewDecision: action.decision as FileSnapshot['reviewDecision'],
          status: action.decision === 'rejected' ? 'rejected' : snapshot.status,
        });
      }
      return { ...state, changes };
    }

    case 'APPLY': {
      const snapshot = changes.get(action.changeId);
      if (snapshot) {
        changes.set(action.changeId, {
          ...snapshot,
          status: 'applied',
          unifiedDiff: action.diff,
        });
      }
      return { changes, selectedId: action.changeId };
    }

    case 'ACCEPT': {
      const snapshot = changes.get(action.changeId);
      if (snapshot) {
        changes.set(action.changeId, { ...snapshot, status: 'accepted' });
      }
      return { ...state, changes };
    }

    case 'REJECT': {
      const snapshot = changes.get(action.changeId);
      if (snapshot) {
        changes.set(action.changeId, { ...snapshot, status: 'rejected' });
      }
      return { ...state, changes };
    }

    case 'SELECT':
      return { ...state, selectedId: action.changeId };

    default:
      return state;
  }
}

const initialState: ChangesState = {
  changes: new Map(),
  selectedId: null,
};

export function useChanges(onMessage: (handler: (msg: WsMessage) => void) => void) {
  const [state, dispatch] = useReducer(changesReducer, initialState);

  // Carica le modifiche esistenti all'avvio
  useEffect(() => {
    fetch('/api/changes')
      .then(res => res.json())
      .then((data: FileSnapshot[]) => {
        dispatch({ type: 'LOAD_ALL', changes: data });
      })
      .catch(() => { /* Server non disponibile */ });
  }, []);

  // Gestisci messaggi WebSocket
  useEffect(() => {
    onMessage((msg: WsMessage) => {
      switch (msg.type) {
        case 'change:preview':
          dispatch({
            type: 'ADD_PREVIEW',
            change: {
              changeId: msg.changeId,
              filePath: msg.filePath,
              toolName: msg.toolName as 'Edit' | 'Write',
              unifiedDiff: msg.diff,
              timestamp: msg.timestamp,
            },
          });
          break;

        case 'change:applied':
          dispatch({ type: 'APPLY', changeId: msg.changeId, diff: msg.diff });
          break;

        case 'change:accepted':
          dispatch({ type: 'ACCEPT', changeId: msg.changeId });
          break;

        case 'change:rejected':
          dispatch({ type: 'REJECT', changeId: msg.changeId });
          break;

        case 'review:request':
          dispatch({
            type: 'ADD_REVIEW',
            change: {
              changeId: msg.changeId,
              filePath: msg.filePath,
              toolName: msg.toolName as 'Edit' | 'Write',
              unifiedDiff: msg.diff,
              timestamp: msg.timestamp,
            },
          });
          break;

        case 'review:decided':
          dispatch({ type: 'REVIEW_DECIDED', changeId: msg.changeId, decision: msg.decision });
          break;
      }
    });
  }, [onMessage]);

  // Azioni per la UI
  const accept = useCallback(async (changeId: string) => {
    await fetch('/api/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeId }),
    });
  }, []);

  const reject = useCallback(async (changeId: string) => {
    const res = await fetch('/api/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeId }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Rollback fallito');
    }
  }, []);

  const acceptAll = useCallback(async () => {
    await fetch('/api/accept-all', { method: 'POST' });
  }, []);

  const rejectAll = useCallback(async () => {
    const res = await fetch('/api/reject-all', { method: 'POST' });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Reject all fallito');
    }
  }, []);

  // Azioni review gate
  const approveReview = useCallback(async (changeId: string) => {
    await fetch(`/api/review/${changeId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approved' }),
    });
  }, []);

  const rejectReview = useCallback(async (changeId: string) => {
    await fetch(`/api/review/${changeId}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'rejected' }),
    });
  }, []);

  const select = useCallback((changeId: string | null) => {
    dispatch({ type: 'SELECT', changeId });
  }, []);

  // Converti Map in array ordinato per timestamp (più recente prima)
  const changesList = Array.from(state.changes.values())
    .sort((a, b) => b.timestamp - a.timestamp);

  const pendingCount = changesList.filter(c => c.status === 'applied').length;
  const reviewCount = changesList.filter(c => c.status === 'pending_review').length;

  // Statistiche sessione
  const stats = {
    total: changesList.length,
    pending: pendingCount,
    accepted: changesList.filter(c => c.status === 'accepted').length,
    rejected: changesList.filter(c => c.status === 'rejected').length,
    files: new Set(changesList.map(c => c.filePath)).size,
  };

  return {
    changes: changesList,
    selectedId: state.selectedId,
    selectedChange: state.selectedId ? state.changes.get(state.selectedId) || null : null,
    pendingCount,
    reviewCount,
    stats,
    accept,
    reject,
    acceptAll,
    rejectAll,
    approveReview,
    rejectReview,
    select,
  };
}
