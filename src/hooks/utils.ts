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
import type { HookInput } from '../types.js';
import { HOOK_HTTP_TIMEOUT_MS, DEFAULT_PORT } from '../types.js';

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
 * Wrapper sicuro per eseguire un hook con gestione errori.
 * Esce sempre con 0 (non blocca mai Claude Code in review mode).
 */
export async function runHook(
  name: string,
  handler: (input: HookInput) => Promise<void>
): Promise<void> {
  try {
    const input = await readStdin();
    await handler(input);
    process.exit(0);
  } catch (error) {
    // Log su stderr (visibile solo in debug), mai bloccare Claude
    process.stderr.write(`[diffwatch:${name}] Errore: ${error}\n`);
    process.exit(0);
  }
}
