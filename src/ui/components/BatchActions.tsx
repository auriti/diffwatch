/**
 * BatchActions — Accept All / Reject All
 */

import React, { useState } from 'react';

interface BatchActionsProps {
  pendingCount: number;
  onAcceptAll: () => Promise<void>;
  onRejectAll: () => Promise<void>;
}

export function BatchActions({ pendingCount, onAcceptAll, onRejectAll }: BatchActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendingCount === 0) return null;

  async function handleAcceptAll() {
    setLoading(true);
    setError(null);
    try {
      await onAcceptAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRejectAll() {
    if (!confirm(`Rifiutare e rollbackare tutte le ${pendingCount} modifiche pending?`)) return;
    setLoading(true);
    setError(null);
    try {
      await onRejectAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dw-batch-actions">
      <button
        className="dw-btn dw-btn-accept-all"
        onClick={handleAcceptAll}
        disabled={loading}
      >
        ✓ Accept All ({pendingCount})
      </button>
      <button
        className="dw-btn dw-btn-reject-all"
        onClick={handleRejectAll}
        disabled={loading}
      >
        ✗ Reject All ({pendingCount})
      </button>
      {error && <div className="dw-action-error">{error}</div>}
    </div>
  );
}
