/**
 * Diff engine — genera unified diff da contenuto before/after
 */

import { createPatch } from 'diff';

/**
 * Genera una stringa unified diff dal contenuto prima e dopo la modifica.
 * Formato compatibile con diff2html.
 *
 * @param filePath - Path del file (usato come intestazione del diff)
 * @param before - Contenuto prima della modifica
 * @param after - Contenuto dopo la modifica
 * @returns Stringa in formato unified diff
 */
export function createUnifiedDiff(filePath: string, before: string, after: string): string {
  // Usa path relativo per intestazione più leggibile
  const displayPath = shortenPath(filePath);

  return createPatch(
    displayPath,
    before,
    after,
    '', // intestazione vecchia (vuota)
    '', // intestazione nuova (vuota)
    { context: 3 } // righe di contesto attorno ai cambiamenti
  );
}

/**
 * Accorcia il path per visualizzazione:
 * /home/user/project/src/file.ts → src/file.ts
 */
function shortenPath(filePath: string): string {
  // Rimuovi home directory
  const homeDir = process.env.HOME || '/home';
  let short = filePath.replace(homeDir, '~');

  // Se il path è ancora lungo, prendi solo le ultime 3 parti
  const parts = short.split('/');
  if (parts.length > 4) {
    short = parts.slice(-3).join('/');
  }

  return short;
}
