/**
 * Rollback — ripristina file da snapshot
 */

import { readFileSync, writeFileSync } from 'fs';
import type { FileSnapshot } from '../types.js';
import { isPathAllowed } from '../server/path-validator.js';

export interface RollbackResult {
  success: boolean;
  /** Conflitto: il file è stato modificato dopo lo snapshot */
  conflict: boolean;
  message: string;
}

/**
 * Ripristina un file al contenuto precedente (contentBefore).
 * Prima verifica che il contenuto attuale corrisponda a contentAfter.
 * Se non corrisponde → conflitto (il file è stato ri-modificato).
 */
export function rollbackFile(snapshot: FileSnapshot): RollbackResult {
  if (!snapshot.contentAfter) {
    return { success: false, conflict: false, message: 'Snapshot senza contentAfter' };
  }

  // Validazione sicurezza: blocca path traversal
  if (!isPathAllowed(snapshot.filePath)) {
    return {
      success: false,
      conflict: false,
      message: 'SECURITY: percorso file non consentito per rollback',
    };
  }

  try {
    // Leggi il contenuto attuale del file
    let currentContent: string;
    try {
      currentContent = readFileSync(snapshot.filePath, 'utf-8');
    } catch {
      return {
        success: false,
        conflict: false,
        message: `File non trovato: ${snapshot.filePath}`,
      };
    }

    // Verifica che il contenuto attuale corrisponda a contentAfter
    if (currentContent !== snapshot.contentAfter) {
      return {
        success: false,
        conflict: true,
        message: 'Conflitto: il file è stato modificato dopo questa modifica. Rollback non sicuro.',
      };
    }

    // Scrivi il contenuto precedente
    writeFileSync(snapshot.filePath, snapshot.contentBefore, 'utf-8');

    return { success: true, conflict: false, message: 'Rollback riuscito' };
  } catch (err) {
    return {
      success: false,
      conflict: false,
      message: `Errore durante il rollback: ${err}`,
    };
  }
}
