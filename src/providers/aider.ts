/**
 * Provider Aider — rilevamento modifiche via git diff
 *
 * Meccanismo: monitora i commit git nel workspace. Quando Aider crea
 * un commit, analizza il diff e invia le modifiche al server diffwatch.
 *
 * Supporta: Aider, qualsiasi tool che fa commit automatici.
 * NON supporta il review gate (le modifiche sono già committate).
 */

import { execFileSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import type { HookProvider, ProviderOptions, ProviderResult, FileChangeEvent } from './types.js';

export class AiderProvider implements HookProvider {
  readonly name = 'aider';
  readonly description = 'Aider — rilevamento modifiche via git diff polling';
  readonly mechanism = 'git' as const;
  readonly supportsReviewGate = false;

  private pollInterval: NodeJS.Timeout | null = null;
  private lastCommitHash: string = '';
  private options: ProviderOptions | null = null;

  /** Nessuna installazione necessaria */
  install(_hooksDir: string): ProviderResult {
    return { success: true, message: 'Aider provider non richiede installazione. Il polling git si avvia con il server.' };
  }

  uninstall(): ProviderResult {
    return { success: true, message: 'Aider provider non richiede disinstallazione.' };
  }

  /** Verifica che git sia disponibile nel workspace */
  isInstalled(): boolean {
    try {
      execFileSync('git', ['--version'], { encoding: 'utf-8', timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async start(options: ProviderOptions): Promise<void> {
    this.options = options;
    this.log(`Avvio git polling su ${options.workDir}`);

    // Salva l'ultimo commit corrente
    this.lastCommitHash = this.getCurrentCommit();
    this.log(`Commit iniziale: ${this.lastCommitHash || 'nessuno'}`);

    // Poll ogni 2 secondi per nuovi commit
    this.pollInterval = setInterval(() => {
      this.checkForNewCommits();
    }, 2000);
  }

  async stop(): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.log('Git polling fermato');
  }

  /** Ottieni l'hash dell'ultimo commit */
  private getCurrentCommit(): string {
    try {
      return execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf-8',
        cwd: this.options?.workDir,
        timeout: 3000,
      }).trim();
    } catch {
      return '';
    }
  }

  /** Controlla se ci sono nuovi commit */
  private async checkForNewCommits(): Promise<void> {
    const currentHash = this.getCurrentCommit();
    if (!currentHash || currentHash === this.lastCommitHash) return;

    this.log(`Nuovo commit rilevato: ${currentHash.substring(0, 7)}`);

    // Ottieni i file modificati nell'ultimo commit
    try {
      const diffOutput = execFileSync('git', [
        'diff', '--name-only', this.lastCommitHash, currentHash,
      ], {
        encoding: 'utf-8',
        cwd: this.options?.workDir,
        timeout: 5000,
      }).trim();

      const files = diffOutput.split('\n').filter(f => f.trim());

      for (const file of files) {
        await this.processGitFileChange(file, currentHash);
      }
    } catch (err) {
      this.log(`Errore analisi diff: ${err}`);
    }

    this.lastCommitHash = currentHash;
  }

  /** Processa una modifica rilevata via git */
  private async processGitFileChange(relativePath: string, commitHash: string): Promise<void> {
    if (!this.options) return;

    const filePath = `${this.options.workDir}/${relativePath}`;

    // Contenuto prima (dal commit precedente)
    let contentBefore = '';
    try {
      contentBefore = execFileSync('git', [
        'show', `${this.lastCommitHash}:${relativePath}`,
      ], {
        encoding: 'utf-8',
        cwd: this.options.workDir,
        timeout: 3000,
      });
    } catch {
      // File nuovo — contentBefore vuoto
    }

    // Contenuto dopo (dal filesystem o dal nuovo commit)
    let contentAfter = '';
    if (existsSync(filePath)) {
      try {
        contentAfter = readFileSync(filePath, 'utf-8');
      } catch {
        return;
      }
    }

    if (contentBefore === contentAfter) return;

    const event: FileChangeEvent = {
      filePath,
      contentBefore,
      contentAfter,
      toolName: 'Write',
      metadata: {
        provider: 'aider',
        commitHash: commitHash.substring(0, 7),
        detectedVia: 'git-polling',
      },
    };

    await this.options.onFileChange(event);
  }

  private log(message: string): void {
    this.options?.onLog?.(`[aider] ${message}`);
  }
}
