/**
 * Hook PostToolUse per diffwatch
 *
 * Trigger: DOPO che Claude Code ha eseguito Edit o Write
 * Funzione: legge il contenuto reale del file (after) e notifica il server
 */

import { readFileSync, existsSync } from 'fs';
import { runHook, httpPost } from './utils.js';

runHook('post-tool-use', async (input) => {
  const toolName = input.tool_name;
  if (!toolName || (toolName !== 'Edit' && toolName !== 'Write')) return;

  const toolInput = input.tool_input;
  if (!toolInput) return;

  const filePath = toolInput.file_path;
  if (!filePath) return;

  // Leggi il contenuto attuale del file (dopo la modifica di Claude)
  if (!existsSync(filePath)) return;

  let contentAfter: string;
  try {
    contentAfter = readFileSync(filePath, 'utf-8');
  } catch {
    // File non leggibile — ignora
    return;
  }

  // Notifica il server con il contenuto reale
  await httpPost('/api/applied', {
    filePath,
    contentAfter,
  });
});
