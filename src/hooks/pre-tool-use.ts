/**
 * Hook PreToolUse per diffwatch
 *
 * Trigger: PRIMA che Claude Code esegua Edit o Write
 * Funzione: cattura il contenuto del file (before) e invia al server
 */

import { readFileSync, existsSync } from 'fs';
import { runHook, httpPost } from './utils.js';

runHook('pre-tool-use', async (input) => {
  const toolName = input.tool_name;
  if (!toolName || (toolName !== 'Edit' && toolName !== 'Write')) return;

  const toolInput = input.tool_input;
  if (!toolInput) return;

  const filePath = toolInput.file_path;
  if (!filePath) return;

  // Leggi il contenuto attuale del file (before)
  let contentBefore = '';
  if (existsSync(filePath)) {
    try {
      contentBefore = readFileSync(filePath, 'utf-8');
    } catch {
      // File non leggibile (binario o permessi) — ignora
      return;
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

  // Invia lo snapshot al server
  await httpPost('/api/snapshot', {
    filePath,
    contentBefore,
    expectedAfter,
    toolName,
    toolInput: {
      // Invia solo metadati, non il contenuto completo (per debug)
      file_path: filePath,
      tool_name: toolName,
    },
  });
});
