/**
 * Provider Cursor — rilevamento modifiche via file watcher
 *
 * Meccanismo: monitora il filesystem con fs.watch per rilevare modifiche
 * ai file nel workspace. Quando un file viene salvato, confronta il
 * contenuto con lo snapshot precedente e invia la differenza al server.
 *
 * Supporta: Cursor, VS Code, qualsiasi editor che salva file su disco.
 * NON supporta il review gate (le modifiche sono già salvate).
 */

import { watch, readFileSync, existsSync, statSync } from 'fs';
import { join, relative, extname } from 'path';
import type { FSWatcher } from 'fs';
import type { HookProvider, ProviderOptions, ProviderResult, FileChangeEvent } from './types.js';

/** Estensioni file da monitorare */
const WATCHED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.rs', '.java', '.kt',
  '.css', '.scss', '.less', '.html', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.txt', '.sh', '.bash', '.zsh',
  '.sql', '.graphql', '.prisma',
  '.env', '.gitignore', '.dockerignore',
  '.c', '.cpp', '.h', '.hpp',
]);

/** Pattern da escludere */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next',
  '__pycache__', '.cache', 'coverage', '.turbo',
]);

export class CursorProvider implements HookProvider {
  readonly name = 'cursor';
  readonly description = 'Cursor / VS Code — rilevamento modifiche via file watcher';
  readonly mechanism = 'watcher' as const;
  readonly supportsReviewGate = false;

  private watchers: FSWatcher[] = [];
  private fileCache = new Map<string, string>();
  private options: ProviderOptions | null = null;
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  /** Nessuna installazione necessaria — il watcher è in-process */
  install(_hooksDir: string): ProviderResult {
    return { success: true, message: 'Cursor provider non richiede installazione. Il watcher si avvia con il server.' };
  }

  uninstall(): ProviderResult {
    return { success: true, message: 'Cursor provider non richiede disinstallazione.' };
  }

  /** Sempre "installato" — funziona out of the box */
  isInstalled(): boolean {
    return true;
  }

  async start(options: ProviderOptions): Promise<void> {
    this.options = options;
    this.log(`Avvio file watcher su ${options.workDir}`);

    // Popola la cache iniziale dei file
    this.scanDirectory(options.workDir);

    // Avvia il watcher ricorsivo
    try {
      const watcher = watch(options.workDir, { recursive: true }, (eventType, filename) => {
        if (!filename || eventType !== 'change') return;
        this.handleFileChange(join(options.workDir, filename));
      });

      this.watchers.push(watcher);
      this.log(`File watcher attivo — ${this.fileCache.size} file in cache`);
    } catch (err) {
      this.log(`Errore avvio watcher: ${err}`);
    }
  }

  async stop(): Promise<void> {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.fileCache.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.log('File watcher fermato');
  }

  /** Scansiona una directory e popola la cache */
  private scanDirectory(dir: string): void {
    try {
      const { readdirSync } = require('fs') as typeof import('fs');
      const entries = readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name)) continue;
          this.scanDirectory(join(dir, entry.name));
        } else if (entry.isFile()) {
          const ext = extname(entry.name);
          if (!WATCHED_EXTENSIONS.has(ext)) continue;

          const filePath = join(dir, entry.name);
          try {
            const content = readFileSync(filePath, 'utf-8');
            this.fileCache.set(filePath, content);
          } catch {
            // File non leggibile — ignora
          }
        }
      }
    } catch {
      // Directory non leggibile
    }
  }

  /** Gestisce una modifica file con debounce */
  private handleFileChange(filePath: string): void {
    // Verifica estensione
    const ext = extname(filePath);
    if (!WATCHED_EXTENSIONS.has(ext)) return;

    // Verifica che non sia in una directory ignorata
    const relPath = relative(this.options?.workDir || '', filePath);
    if (relPath.split('/').some(part => IGNORED_DIRS.has(part))) return;

    // Debounce: aspetta 200ms per evitare eventi multipli
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.processFileChange(filePath);
    }, 200));
  }

  /** Processa una modifica file (dopo debounce) */
  private async processFileChange(filePath: string): Promise<void> {
    if (!this.options || !existsSync(filePath)) return;

    try {
      const stat = statSync(filePath);
      // Ignora file troppo grandi (> 1MB)
      if (stat.size > 1_000_000) return;

      const contentAfter = readFileSync(filePath, 'utf-8');
      const contentBefore = this.fileCache.get(filePath) || '';

      // Aggiorna cache
      this.fileCache.set(filePath, contentAfter);

      // Se il contenuto è uguale, ignora
      if (contentBefore === contentAfter) return;

      const event: FileChangeEvent = {
        filePath,
        contentBefore,
        contentAfter,
        toolName: 'Write',
        metadata: { provider: 'cursor', detectedVia: 'fs.watch' },
      };

      await this.options.onFileChange(event);
    } catch {
      // Errore lettura file — ignora
    }
  }

  private log(message: string): void {
    this.options?.onLog?.(`[cursor] ${message}`);
  }
}
