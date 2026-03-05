/**
 * App — Root component React per diffwatch
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useChanges } from './hooks/useChanges.js';
import type { StatusFilter } from './components/FileList.js';
import { Header } from './components/Header.js';
import { FileList } from './components/FileList.js';
import { DiffViewer } from './components/DiffViewer.js';
import { ActionBar } from './components/ActionBar.js';
import { BatchActions } from './components/BatchActions.js';
import { ReviewBar } from './components/ReviewBar.js';

function App() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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

  // Trova la prima review in attesa (la più recente)
  const pendingReview = changes.find(c => c.status === 'pending_review') || null;

  return (
    <div className="dw-app">
      <Header connected={connected} pendingCount={pendingCount} reviewCount={reviewCount} stats={stats} />

      {/* Barra review gate — visibile solo quando c'è una review in attesa */}
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
              <span className="dw-content-tool">{selectedChange.toolName}</span>
            </div>
          )}

          <DiffViewer
            diff={selectedChange?.unifiedDiff || ''}
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
