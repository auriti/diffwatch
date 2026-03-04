/**
 * Header — stato connessione WS + contatore modifiche pending
 */

import React from 'react';

interface HeaderProps {
  connected: boolean;
  pendingCount: number;
}

export function Header({ connected, pendingCount }: HeaderProps) {
  return (
    <header className="dw-header">
      <div className="dw-header-left">
        <h1 className="dw-logo">diffwatch</h1>
        <span className="dw-subtitle">real-time diff viewer</span>
      </div>
      <div className="dw-header-right">
        {pendingCount > 0 && (
          <span className="dw-badge dw-badge-pending">
            {pendingCount} pending
          </span>
        )}
        <span className={`dw-status ${connected ? 'dw-status-connected' : 'dw-status-disconnected'}`}>
          <span className="dw-status-dot" />
          {connected ? 'Connesso' : 'Disconnesso'}
        </span>
      </div>
    </header>
  );
}
