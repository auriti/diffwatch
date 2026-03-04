/**
 * ActionBar — pulsanti Accept/Reject per singola modifica
 */

import React, { useState } from 'react';
import type { FileSnapshot } from '../../types.js';

interface ActionBarProps {
  change: FileSnapshot | null;
  onAccept: (changeId: string) => Promise<void>;
  onReject: (changeId: string) => Promise<void>;
}

export function ActionBar({ change, onAccept, onReject }: ActionBarProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!change) return null;

  // Mostra azioni solo per modifiche 'applied'
  if (change.status !== 'applied') {
    return (
      <div className="dw-action-bar">
        <span className={`dw-action-status dw-action-status-${change.status}`}>
          {change.status === 'accepted' ? '✓ Accettata' :
           change.status === 'rejected' ? '✗ Rifiutata (rollback)' :
           change.status === 'preview' ? '⏳ In applicazione...' :
           change.status}
        </span>
      </div>
    );
  }

  async function handleAccept() {
    if (!change) return;
    setLoading(true);
    setError(null);
    try {
      await onAccept(change.changeId);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!change) return;
    setLoading(true);
    setError(null);
    try {
      await onReject(change.changeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dw-action-bar">
      <div className="dw-action-buttons">
        <button
          className="dw-btn dw-btn-accept"
          onClick={handleAccept}
          disabled={loading}
        >
          ✓ Accept
        </button>
        <button
          className="dw-btn dw-btn-reject"
          onClick={handleReject}
          disabled={loading}
        >
          ✗ Reject
        </button>
      </div>
      {error && <div className="dw-action-error">{error}</div>}
    </div>
  );
}
