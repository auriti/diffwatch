/**
 * Hook PreToolUse per diffwatch
 *
 * Trigger: PRIMA che Claude Code esegua Edit o Write
 * Funzione: cattura il contenuto del file (before) e invia al server
 *
 * Modalità:
 * - Normale: invia snapshot e esce con 0 (non blocca mai)
 * - Review gate (DIFFWATCH_REVIEW=1): invia review request, attende approvazione UI
 *   - Approvato/timeout → exit 0 (permetti)
 *   - Rifiutato → exit 2 (blocca)
 */

import { readFileSync, existsSync } from 'fs';
import { runHook, httpPost, isReviewMode, waitForReviewDecision } from './utils.js';

runHook('pre-tool-use', async (input) => {
  const toolName = input.tool_name;
  if (!toolName || (toolName !== 'Edit' && toolName !== 'Write')) return 0;

  const toolInput = input.tool_input;
  if (!toolInput) return 0;

  const filePath = toolInput.file_path;
  if (!filePath) return 0;

  // Leggi il contenuto attuale del file (before)
  let contentBefore = '';
  if (existsSync(filePath)) {
    try {
      contentBefore = readFileSync(filePath, 'utf-8');
    } catch {
      // File non leggibile (binario o permessi) — ignora
      return 0;
    }
  }

  // Calcola il contenuto previsto dopo la modifica
  let expectedAfter = '';

  if (toolName === 'Write') {
    // Write: il nuovo contenuto è in tool_input.content
    expectedAfter = (toolInput.content as string) || '';
  } else if (toolName === 'Edit') {
    // Edit: applica la sostituzione old_string → new_string
    const oldString = toolInput.old_string as string | undefined;
    const newString = toolInput.new_string as string | undefined;

    if (oldString !== undefined && newString !== undefined) {
      expectedAfter = contentBefore.replace(oldString, newString);
    } else {
      expectedAfter = contentBefore;
    }
  }

  const payload = {
    filePath,
    contentBefore,
    expectedAfter,
    toolName,
    toolInput: {
      file_path: filePath,
      tool_name: toolName,
    },
  };

  // Modalità review gate: invia a /api/review e attendi decisione
  if (isReviewMode()) {
    try {
      const port = process.env.DIFFWATCH_PORT || '3333';
      const url = `http://127.0.0.1:${port}/api/review`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // Token auth se disponibile
      try {
        const { readFileSync: readFs, existsSync: existsFs } = await import('fs');
        const { join } = await import('path');
        const { homedir } = await import('os');
        const tokenFile = join(homedir(), '.diffwatch-token');
        if (existsFs(tokenFile)) {
          const token = readFs(tokenFile, 'utf-8').trim();
          if (token) headers['Authorization'] = `Bearer ${token}`;
        }
      } catch { /* ignora */ }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        // Server non disponibile — permetti comunque
        return 0;
      }

      const data = await res.json() as { changeId: string };
      const decision = await waitForReviewDecision(data.changeId);

      if (decision === 'rejected') {
        // Blocca il tool — Claude vedrà il messaggio
        process.stderr.write('[diffwatch] Modifica rifiutata dall\'utente via review gate\n');
        return 2;
      }

      // approved o timeout → permetti
      return 0;
    } catch {
      // Errore — non bloccare Claude
      return 0;
    }
  }

  // Modalità normale: invia snapshot e permetti
  await httpPost('/api/snapshot', payload);
  return 0;
});
