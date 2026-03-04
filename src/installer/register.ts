/**
 * Installer — registra/rimuove hooks in ~/.claude/settings.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

const SETTINGS_PATH = join(process.env.HOME || '/home', '.claude', 'settings.json');

interface HookEntry {
  matcher?: string;
  hooks: Array<{
    type: string;
    command: string;
    timeout?: number;
  }>;
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Registra gli hooks diffwatch in ~/.claude/settings.json
 * @param hookBasePath - Path assoluto alla directory dist/hooks/
 */
export function installHooks(hookBasePath: string): { success: boolean; message: string } {
  try {
    // Assicurati che la directory .claude esista
    const claudeDir = dirname(SETTINGS_PATH);
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    // Leggi settings esistenti o crea oggetto vuoto
    let settings: ClaudeSettings = {};
    if (existsSync(SETTINGS_PATH)) {
      const raw = readFileSync(SETTINGS_PATH, 'utf-8');
      settings = JSON.parse(raw);
    }

    // Assicurati che hooks{} esista
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Path assoluti degli hook
    const preHookPath = join(hookBasePath, 'pre-tool-use.js');
    const postHookPath = join(hookBasePath, 'post-tool-use.js');

    // Rimuovi hook diffwatch esistenti (idempotente)
    removeExistingHooks(settings);

    // Aggiungi PreToolUse hook
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [];
    }
    settings.hooks.PreToolUse.push({
      matcher: 'Edit|Write',
      hooks: [{
        type: 'command',
        command: `node ${preHookPath}`,
        timeout: 5,
      }],
    });

    // Aggiungi PostToolUse hook
    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = [];
    }
    settings.hooks.PostToolUse.push({
      matcher: 'Edit|Write',
      hooks: [{
        type: 'command',
        command: `node ${postHookPath}`,
        timeout: 5,
      }],
    });

    // Scrivi settings aggiornati
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

    return {
      success: true,
      message: `Hook registrati in ${SETTINGS_PATH}\n  PreToolUse: ${preHookPath}\n  PostToolUse: ${postHookPath}`,
    };
  } catch (err) {
    return {
      success: false,
      message: `Errore registrazione hooks: ${err}`,
    };
  }
}

/**
 * Rimuove gli hooks diffwatch da ~/.claude/settings.json
 */
export function uninstallHooks(): { success: boolean; message: string } {
  try {
    if (!existsSync(SETTINGS_PATH)) {
      return { success: true, message: 'Nessun settings.json trovato. Nulla da rimuovere.' };
    }

    const raw = readFileSync(SETTINGS_PATH, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(raw);

    removeExistingHooks(settings);

    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8');

    return { success: true, message: 'Hook diffwatch rimossi.' };
  } catch (err) {
    return { success: false, message: `Errore rimozione hooks: ${err}` };
  }
}

/**
 * Verifica se gli hooks diffwatch sono registrati
 */
export function checkHooksInstalled(): boolean {
  try {
    if (!existsSync(SETTINGS_PATH)) return false;

    const raw = readFileSync(SETTINGS_PATH, 'utf-8');
    const settings: ClaudeSettings = JSON.parse(raw);

    if (!settings.hooks) return false;

    const hasPreHook = settings.hooks.PreToolUse?.some(
      entry => entry.hooks?.some(h => h.command?.includes('diffwatch'))
    ) ?? false;

    const hasPostHook = settings.hooks.PostToolUse?.some(
      entry => entry.hooks?.some(h => h.command?.includes('diffwatch'))
    ) ?? false;

    return hasPreHook && hasPostHook;
  } catch {
    return false;
  }
}

/**
 * Rimuove TUTTI gli hook il cui command contiene 'diffwatch'
 * Opera sia dentro hooks{} che top-level (backward compatibility)
 */
function removeExistingHooks(settings: ClaudeSettings): void {
  // Rimuovi dentro hooks{}
  if (settings.hooks) {
    for (const eventName of Object.keys(settings.hooks)) {
      const entries = settings.hooks[eventName];
      if (!Array.isArray(entries)) continue;

      settings.hooks[eventName] = entries.filter(
        entry => !entry.hooks?.some(h => h.command?.includes('diffwatch'))
      );

      // Rimuovi array vuoto
      if (settings.hooks[eventName].length === 0) {
        delete settings.hooks[eventName];
      }
    }
  }

  // Rimuovi anche top-level (caso legacy come kiro-memory)
  for (const key of Object.keys(settings)) {
    if (key === 'hooks') continue;
    const value = settings[key];
    if (!Array.isArray(value)) continue;

    // Verifica se sembra un array di hook entries
    const isHookArray = value.some(
      (item: unknown) => typeof item === 'object' && item !== null && 'hooks' in item
    );
    if (!isHookArray) continue;

    settings[key] = value.filter(
      (entry: HookEntry) => !entry.hooks?.some(h => h.command?.includes('diffwatch'))
    );
  }
}
