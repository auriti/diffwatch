/**
 * Autenticazione token per API hooks
 * Issue #7: implementa auth token per API hooks
 *
 * Genera un token random 256-bit all'avvio del server.
 * Gli hooks devono inviare il token nell'header Authorization.
 */

import { randomBytes } from 'crypto';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Request, Response, NextFunction } from 'express';

const TOKEN_FILE = join(homedir(), '.diffwatch-token');

let serverToken: string | null = null;

/**
 * Genera e salva un token di autenticazione (256-bit hex).
 * Il token viene salvato in ~/.diffwatch-token per gli hooks.
 */
export function generateServerToken(): string {
  serverToken = randomBytes(32).toString('hex');

  // Salva token su file per gli hooks
  try {
    writeFileSync(TOKEN_FILE, serverToken, { mode: 0o600 });
  } catch {
    // Se non riesce a scrivere il file, il token funziona solo in-memory
    process.stderr.write('[diffwatch] Attenzione: impossibile salvare token su file\n');
  }

  return serverToken;
}

/**
 * Legge il token dal file (usato dagli hooks).
 */
export function readToken(): string | null {
  try {
    if (existsSync(TOKEN_FILE)) {
      return readFileSync(TOKEN_FILE, 'utf-8').trim();
    }
  } catch {
    // Ignora errori di lettura
  }
  return null;
}

/**
 * Middleware Express per autenticazione.
 * Richiede header: Authorization: Bearer <token>
 * Endpoint GET sono esclusi (read-only, nessun dato sensibile).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // GET requests sono pubbliche (read-only)
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    next();
    return;
  }

  if (!serverToken) {
    // Se non c'è token configurato, passa (modalità sviluppo)
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: token mancante' });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== serverToken) {
    res.status(401).json({ error: 'Unauthorized: token non valido' });
    return;
  }

  next();
}
