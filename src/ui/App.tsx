/**
 * App — Root component React per diffwatch
 */

import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useChanges } from './hooks/useChanges.js';
import { useKeyboard } from './hooks/useKeyboard.js';
import { useNotifications } from './hooks/useNotifications.js';
import type { StatusFilter } from './components/FileList.js';
import { Header } from './components/Header.js';
import { FileList } from './components/FileList.js';
import { DiffViewer } from './components/DiffViewer.js';
import { ActionBar } from './components/ActionBar.js';
import { BatchActions } from './components/BatchActions.js';
import { ReviewBar } from './components/ReviewBar.js';

type DiffFormat = 'side-by-side' | 'line-by-line';

function App() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [diffFormat, setDiffFormat] = useState<DiffFormat>('side-by-side');
  const { connected, onMessage } = useWebSocket();
  const {
    changes,
    selectedId,
    selectedChange,
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
  } = useChanges(onMessage);

  const toggleDiffFormat = useCallback(() => {
    setDiffFormat(f => f === 'side-by-side' ? 'line-by-line' : 'side-by-side');
  }, []);

  // Notifiche browser
  useNotifications(onMessage);

  // Keyboard shortcuts
  useKeyboard({
    changes,
    selectedId,
    selectedChange,
    onSelect: select,
    onAccept: accept,
    onReject: reject,
    onAcceptAll: acceptAll,
    onRejectAll: rejectAll,
    onToggleDiffFormat: toggleDiffFormat,
  });

  // Trova la prima review in attesa (la più recente)
  const pendingReview = changes.find(c => c.status === 'pending_review') || null;

  return (
    <div className="dw-app">
      <Header connected={connected} pendingCount={pendingCount} reviewCount={reviewCount} stats={stats} />

      {/* Barra review gate */}
      <ReviewBar
        change={pendingReview}
        onApprove={approveReview}
        onReject={rejectReview}
      />

      <div className="dw-main">
        <FileList
          changes={changes}
          selectedId={selectedId}
          onSelect={select}
          statusFilter={statusFilter}
          onFilterChange={setStatusFilter}
        />

        <div className="dw-content">
          {selectedChange && (
            <div className="dw-content-header">
              <span className="dw-content-file">{selectedChange.filePath}</span>
              <div className="dw-content-controls">
                <button
                  className={`dw-btn-toggle ${diffFormat === 'side-by-side' ? 'dw-btn-toggle-active' : ''}`}
                  onClick={() => setDiffFormat('side-by-side')}
                  title="Vista affiancata (v)"
                >
                  Side
                </button>
                <button
                  className={`dw-btn-toggle ${diffFormat === 'line-by-line' ? 'dw-btn-toggle-active' : ''}`}
                  onClick={() => setDiffFormat('line-by-line')}
                  title="Vista inline (v)"
                >
                  Inline
                </button>
                <span className="dw-content-tool">{selectedChange.toolName}</span>
              </div>
            </div>
          )}

          <DiffViewer
            diff={selectedChange?.unifiedDiff || ''}
            outputFormat={diffFormat}
          />

          <ActionBar
            change={selectedChange}
            onAccept={accept}
            onReject={reject}
          />

          <BatchActions
            pendingCount={pendingCount}
            onAcceptAll={acceptAll}
            onRejectAll={rejectAll}
          />
        </div>
      </div>
    </div>
  );
}

// Mount React
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<App />);
}
