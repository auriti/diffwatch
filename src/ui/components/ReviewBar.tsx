/**
 * ReviewBar — Barra di approvazione/rifiuto per il review gate
 * Mostrata quando un tool è in attesa di approvazione
 */

import React from 'react';
import type { FileSnapshot } from '../../types.js';

interface ReviewBarProps {
  change: FileSnapshot | null;
  onApprove: (changeId: string) => void;
  onReject: (changeId: string) => void;
}

export function ReviewBar({ change, onApprove, onReject }: ReviewBarProps) {
  if (!change || change.status !== 'pending_review') return null;

  return (
    <div className="dw-review-bar">
      <div className="dw-review-info">
        <span className="dw-review-pulse" />
        <span className="dw-review-label">Review richiesta</span>
        <span className="dw-review-file">{change.filePath.split('/').pop()}</span>
        <span className="dw-review-tool">{change.toolName}</span>
      </div>
      <div className="dw-review-actions">
        <button
          className="dw-btn dw-btn-review-approve"
          onClick={() => onApprove(change.changeId)}
        >
          Approva
        </button>
        <button
          className="dw-btn dw-btn-review-reject"
          onClick={() => onReject(change.changeId)}
        >
          Rifiuta
        </button>
      </div>
    </div>
  );
}
