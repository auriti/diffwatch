/**
 * Hook per keyboard shortcuts globali
 *
 * Shortcuts:
 * - j / ArrowDown: seleziona prossima modifica
 * - k / ArrowUp: seleziona modifica precedente
 * - a: accetta modifica selezionata
 * - r: rifiuta modifica selezionata
 * - v: toggle vista diff (inline/side-by-side)
 * - A (shift+a): accetta tutte
 * - R (shift+r): rifiuta tutte
 */

import { useEffect } from 'react';
import type { FileSnapshot } from '../../types.js';

interface UseKeyboardOptions {
  changes: FileSnapshot[];
  selectedId: string | null;
  selectedChange: FileSnapshot | null;
  onSelect: (changeId: string | null) => void;
  onAccept: (changeId: string) => void;
  onReject: (changeId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onToggleDiffFormat: () => void;
}

export function useKeyboard(options: UseKeyboardOptions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignora se focus è su un input/textarea/button
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const {
        changes, selectedId, selectedChange,
        onSelect, onAccept, onReject,
        onAcceptAll, onRejectAll, onToggleDiffFormat,
      } = options;

      switch (e.key) {
        case 'j':
        case 'ArrowDown': {
          e.preventDefault();
          const idx = changes.findIndex(c => c.changeId === selectedId);
          if (idx < changes.length - 1) {
            onSelect(changes[idx + 1].changeId);
          }
          break;
        }

        case 'k':
        case 'ArrowUp': {
          e.preventDefault();
          const idx = changes.findIndex(c => c.changeId === selectedId);
          if (idx > 0) {
            onSelect(changes[idx - 1].changeId);
          }
          break;
        }

        case 'a': {
          if (e.shiftKey) {
            // Shift+A: accetta tutte
            onAcceptAll();
          } else if (selectedChange && selectedChange.status === 'applied') {
            onAccept(selectedChange.changeId);
          }
          break;
        }

        case 'r': {
          if (e.shiftKey) {
            // Shift+R: rifiuta tutte
            onRejectAll();
          } else if (selectedChange && selectedChange.status === 'applied') {
            onReject(selectedChange.changeId);
          }
          break;
        }

        case 'v': {
          onToggleDiffFormat();
          break;
        }

        // Shift+A e Shift+R (uppercase)
        case 'A': {
          onAcceptAll();
          break;
        }
        case 'R': {
          onRejectAll();
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [options]);
}
