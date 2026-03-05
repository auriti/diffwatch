/**
 * DiffViewer — renderizza diff con diff2html
 *
 * NOTA sicurezza: diff2html usa internamente innerHTML per il rendering.
 * Il contenuto è generato dal nostro diff engine (non input utente web),
 * quindi il rischio XSS è trascurabile. Il fallback usa textContent.
 *
 * Per diff grandi (>500 righe) mostra fallback testuale con
 * opzione di caricare il rendering completo su richiesta.
 */

import React, { useEffect, useRef, useState } from 'react';

/** Soglia righe per lazy loading */
const LARGE_DIFF_THRESHOLD = 500;

interface DiffViewerProps {
  /** Stringa unified diff */
  diff: string;
  /** Formato output */
  outputFormat?: 'side-by-side' | 'line-by-line';
}

export function DiffViewer({ diff, outputFormat = 'side-by-side' }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [forceRender, setForceRender] = useState(false);

  // Reset forceRender quando cambia il diff
  useEffect(() => {
    setForceRender(false);
  }, [diff]);

  const lineCount = diff ? diff.split('\n').length : 0;
  const isLargeDiff = lineCount > LARGE_DIFF_THRESHOLD;

  useEffect(() => {
    if (!containerRef.current || !diff) return;
    if (isLargeDiff && !forceRender) return;

    // Importa diff2html dinamicamente (bundled via esbuild)
    import('diff2html').then(({ html: diff2htmlHtml }) => {
      if (!containerRef.current) return;

      const config = {
        drawFileList: false,
        matching: 'lines' as const,
        outputFormat,
        synchronisedScroll: true,
        highlight: true,
        colorScheme: 'dark' as const,
        renderNothingWhenEmpty: false,
        fileContentToggle: false,
        stickyFileHeaders: true,
      };

      // diff2html.html() genera HTML sicuro dal diff string
      const htmlOutput = diff2htmlHtml(diff, config);

      // diff2html richiede innerHTML per il rendering —
      // il contenuto è generato internamente, non da input utente
      containerRef.current.innerHTML = htmlOutput;
    }).catch(() => {
      // Fallback: mostra diff come testo pre-formattato (textContent, no XSS)
      if (containerRef.current) {
        containerRef.current.textContent = '';
        const pre = document.createElement('pre');
        pre.className = 'dw-diff-fallback';
        pre.textContent = diff;
        containerRef.current.appendChild(pre);
      }
    });
  }, [diff, outputFormat, forceRender, isLargeDiff]);

  if (!diff) {
    return (
      <div className="dw-diff-empty">
        <p>Seleziona una modifica dalla lista per vedere il diff</p>
      </div>
    );
  }

  // Lazy loading per diff grandi
  if (isLargeDiff && !forceRender) {
    return (
      <div className="dw-diff-container">
        <div className="dw-diff-large-warning">
          <p>Diff grande ({lineCount} righe)</p>
          <pre className="dw-diff-fallback">{diff}</pre>
          <button
            className="dw-btn dw-btn-load-full"
            onClick={() => setForceRender(true)}
          >
            Carica rendering completo
          </button>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="dw-diff-container" />;
}
