/**
 * FileList — sidebar con lista file modificati
 */

import React from 'react';
import type { FileSnapshot } from '../../types.js';

export type StatusFilter = 'all' | 'applied' | 'accepted' | 'rejected';

interface FileListProps {
  changes: FileSnapshot[];
  selectedId: string | null;
  onSelect: (changeId: string) => void;
  statusFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
}

/** Estrai il nome breve dal path */
function basename(filePath: string): string {
  return filePath.split('/').pop() || filePath;
}

/** Path relativo per tooltip */
function relativePath(filePath: string): string {
  const home = '/home/';
  const idx = filePath.indexOf(home);
  if (idx !== -1) {
    const afterHome = filePath.substring(idx + home.length);
    const parts = afterHome.split('/');
    return parts.slice(1).join('/'); // Rimuovi username
  }
  return filePath;
}

/** Badge di stato */
function statusBadge(status: string): { className: string; label: string } {
  switch (status) {
    case 'preview':
      return { className: 'dw-badge dw-badge-preview', label: 'preview' };
    case 'pending_review':
      return { className: 'dw-badge dw-badge-review', label: 'review' };
    case 'applied':
      return { className: 'dw-badge dw-badge-pending', label: 'pending' };
    case 'accepted':
      return { className: 'dw-badge dw-badge-accepted', label: 'accepted' };
    case 'rejected':
      return { className: 'dw-badge dw-badge-rejected', label: 'rejected' };
    default:
      return { className: 'dw-badge', label: status };
  }
}

/** Icona per tipo di tool */
function toolIcon(toolName: string): string {
  return toolName === 'Write' ? '📝' : '✏️';
}

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'applied', label: 'Pending' },
  { value: 'accepted', label: 'Accettati' },
  { value: 'rejected', label: 'Rifiutati' },
];

export function FileList({ changes, selectedId, onSelect, statusFilter, onFilterChange }: FileListProps) {
  const filtered = statusFilter === 'all'
    ? changes
    : changes.filter(c => c.status === statusFilter);

  if (changes.length === 0) {
    return (
      <aside className="dw-sidebar">
        <div className="dw-sidebar-header">
          <h2>Modifiche</h2>
        </div>
        <div className="dw-sidebar-empty">
          <p>In attesa di modifiche...</p>
          <p className="dw-muted">Claude Code inviera' i diff qui in tempo reale</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="dw-sidebar">
      <div className="dw-sidebar-header">
        <h2>Modifiche ({filtered.length}/{changes.length})</h2>
      </div>
      <div className="dw-filters">
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`dw-filter-btn ${statusFilter === f.value ? 'dw-filter-btn-active' : ''}`}
            onClick={() => onFilterChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="dw-file-list">
        {filtered.map(change => {
          const badge = statusBadge(change.status);
          const isSelected = change.changeId === selectedId;

          return (
            <li
              key={change.changeId}
              className={`dw-file-item ${isSelected ? 'dw-file-item-selected' : ''}`}
              onClick={() => onSelect(change.changeId)}
              title={relativePath(change.filePath)}
            >
              <div className="dw-file-item-top">
                <span className="dw-file-icon">{toolIcon(change.toolName)}</span>
                <span className="dw-file-name">{basename(change.filePath)}</span>
                <span className={badge.className}>{badge.label}</span>
              </div>
              <div className="dw-file-item-path">
                {relativePath(change.filePath)}
              </div>
              <div className="dw-file-item-time">
                {new Date(change.timestamp).toLocaleTimeString('it-IT')}
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
