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
  if (!toolName || (toolName !== 'Edit' && toolName !== 'Write')) return 0;

  const toolInput = input.tool_input;
  if (!toolInput) return 0;

  const filePath = toolInput.file_path;
  if (!filePath) return 0;

  // Leggi il contenuto attuale del file (dopo la modifica di Claude)
  if (!existsSync(filePath)) return 0;

  let contentAfter: string;
  try {
    contentAfter = readFileSync(filePath, 'utf-8');
  } catch {
    // File non leggibile — ignora
    return 0;
  }

  // Notifica il server con il contenuto reale
  await httpPost('/api/applied', {
    filePath,
    contentAfter,
  });

  return 0;
});
