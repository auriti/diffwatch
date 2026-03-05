/**
 * Path Validator — previene path traversal (CWE-22)
 * Verifica che i percorsi file siano sotto la directory di lavoro corrente
 */

import { resolve, normalize } from 'path';

/**
 * Verifica se un percorso file è consentito.
 * Solo file sotto la directory di lavoro corrente sono permessi.
 */
export function isPathAllowed(filePath: string): boolean {
  // Blocca null byte injection
  if (filePath.includes('\0')) return false;

  // Blocca caratteri Unicode non-ASCII sospetti nel percorso
  // (previene homograph attack con caratteri cirillici/simili)
  if (/[^\x00-\x7F]/.test(filePath)) return false;

  try {
    // Risolvi il percorso assoluto (gestisce ./, ../, segmenti ridondanti)
    const resolved = resolve(process.cwd(), filePath);
    const normalizedCwd = normalize(process.cwd());

    // Il percorso risolto deve iniziare con la directory di lavoro
    return resolved.startsWith(normalizedCwd + '/') || resolved === normalizedCwd;
  } catch {
    return false;
  }
}
