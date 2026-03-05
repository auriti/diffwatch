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
 * Endpoint UI che non richiedono auth (azioni dal browser stesso).
 * Sono sicure perché CORS limita l'accesso a localhost.
 */
const UI_ENDPOINTS = [
  '/api/accept',
  '/api/reject',
  '/api/rollback',
  '/api/accept-all',
  '/api/reject-all',
  '/api/changes',
];

/**
 * Middleware Express per autenticazione.
 * - GET/OPTIONS: sempre pubblici
 * - Endpoint UI (accept, reject, rollback): pubblici (protetti da CORS)
 * - Endpoint hook (snapshot, applied, review): richiedono Bearer token
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // GET e OPTIONS sono pubblici
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    next();
    return;
  }

  if (!serverToken) {
    next();
    return;
  }

  // Endpoint UI: non richiedono token (CORS protegge da origini esterne)
  if (UI_ENDPOINTS.some(ep => req.path === ep || req.path.startsWith('/api/review/'))) {
    next();
    return;
  }

  // Endpoint hook: richiedono Bearer token
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
