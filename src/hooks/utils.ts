/**
 * Utility condivise per gli hooks diffwatch
 *
 * Contratto hooks Claude Code:
 * - Input: JSON via stdin con { hook_event_name, cwd, tool_name, tool_input }
 * - Output: exit code 0 = success (non blocca mai in review mode)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HookInput, ReviewDecision } from '../types.js';
import { HOOK_HTTP_TIMEOUT_MS, DEFAULT_PORT, REVIEW_TIMEOUT_MS, REVIEW_POLL_INTERVAL_MS } from '../types.js';

/** Legge il token di autenticazione dal file */
function readAuthToken(): string | null {
  try {
    const tokenFile = join(homedir(), '.diffwatch-token');
    if (existsSync(tokenFile)) {
      return readFileSync(tokenFile, 'utf-8').trim();
    }
  } catch {
    // Ignora
  }
  return null;
}

/**
 * Legge e parsa JSON da stdin
 */
export async function readStdin(): Promise<HookInput> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');

    // Safety timeout: se stdin non arriva entro 3s, esci
    const timeout = setTimeout(() => {
      if (!data.trim()) {
        resolve({});
      }
    }, 3000);

    process.stdin.on('data', (chunk) => { data += chunk; });

    process.stdin.on('end', () => {
      clearTimeout(timeout);
      try {
        if (!data.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Errore parsing stdin JSON: ${err}`));
      }
    });

    process.stdin.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Invia HTTP POST al server diffwatch.
 * Non-blocking: se il server non è attivo, fallisce silenziosamente.
 */
export async function httpPost(path: string, body: Record<string, unknown>): Promise<void> {
  const port = process.env.DIFFWATCH_PORT || String(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HOOK_HTTP_TIMEOUT_MS);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = readAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch {
    // Server non attivo o timeout — ignora silenziosamente
  }
}

/**
 * Controlla se il review gate è attivo (via env var DIFFWATCH_REVIEW=1)
 */
export function isReviewMode(): boolean {
  return process.env.DIFFWATCH_REVIEW === '1' || process.env.DIFFWATCH_REVIEW === 'true';
}

/**
 * HTTP GET al server diffwatch.
 */
export async function httpGet<T>(path: string): Promise<T | null> {
  const port = process.env.DIFFWATCH_PORT || String(DEFAULT_PORT);
  const url = `http://127.0.0.1:${port}${path}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HOOK_HTTP_TIMEOUT_MS);

    const headers: Record<string, string> = {};
    const token = readAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

/**
 * Attende la decisione review dal server (polling).
 * Ritorna la decisione o 'timeout' se scade il tempo.
 */
export async function waitForReviewDecision(changeId: string): Promise<ReviewDecision> {
  const timeoutMs = parseInt(process.env.DIFFWATCH_REVIEW_TIMEOUT_MS || String(REVIEW_TIMEOUT_MS), 10);
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await httpGet<{ changeId: string; decision: ReviewDecision | null }>(
      `/api/review/${changeId}`
    );

    if (result?.decision) {
      return result.decision;
    }

    // Attendi prima di riprovare
    await new Promise(resolve => setTimeout(resolve, REVIEW_POLL_INTERVAL_MS));
  }

  // Timeout: auto-approva per non bloccare Claude indefinitamente
  return 'timeout';
}

/**
 * Wrapper sicuro per eseguire un hook.
 * Exit 0 = permetti tool, Exit 2 = blocca tool (review rejected).
 * In caso di errore esce sempre con 0 (non blocca Claude).
 */
export async function runHook(
  name: string,
  handler: (input: HookInput) => Promise<number>
): Promise<void> {
  try {
    const input = await readStdin();
    const exitCode = await handler(input);
    process.exit(exitCode);
  } catch (error) {
    // Log su stderr (visibile solo in debug), mai bloccare Claude per errori
    process.stderr.write(`[diffwatch:${name}] Errore: ${error}\n`);
    process.exit(0);
  }
}
