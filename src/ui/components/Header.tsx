/**
 * Header — stato connessione WS + contatore modifiche pending + git info
 */

import React, { useEffect, useState } from 'react';

interface SessionStats {
  total: number;
  pending: number;
  accepted: number;
  rejected: number;
  files: number;
}

interface GitInfo {
  branch: string;
  commit: string;
  commitMessage: string;
}

interface HeaderProps {
  connected: boolean;
  pendingCount: number;
  reviewCount?: number;
  stats?: SessionStats;
}

export function Header({ connected, pendingCount, reviewCount, stats }: HeaderProps) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);

  useEffect(() => {
    fetch('/api/git-info')
      .then(r => r.json())
      .then((data: GitInfo) => {
        if (data.branch) setGitInfo(data);
      })
      .catch(() => { /* ignora errori git-info */ });
  }, []);

  return (
    <header className="dw-header">
      <div className="dw-header-left">
        <h1 className="dw-logo">diffwatch</h1>
        <span className="dw-subtitle">real-time diff viewer</span>
        {gitInfo && (
          <span className="dw-git-info" title={gitInfo.commitMessage}>
            <span className="dw-git-branch">{gitInfo.branch}</span>
            <span className="dw-git-commit">{gitInfo.commit}</span>
          </span>
        )}
      </div>
      <div className="dw-header-center">
        {stats && stats.total > 0 && (
          <div className="dw-stats">
            <span className="dw-stat" title="Totale modifiche">{stats.total} totali</span>
            <span className="dw-stat-sep">|</span>
            <span className="dw-stat dw-stat-accepted" title="Accettate">{stats.accepted} ok</span>
            <span className="dw-stat-sep">|</span>
            <span className="dw-stat dw-stat-rejected" title="Rifiutate">{stats.rejected} rej</span>
            <span className="dw-stat-sep">|</span>
            <span className="dw-stat" title="File unici">{stats.files} file</span>
          </div>
        )}
      </div>
      <div className="dw-header-right">
        {(reviewCount ?? 0) > 0 && (
          <span className="dw-badge dw-badge-review">
            {reviewCount} review
          </span>
        )}
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
