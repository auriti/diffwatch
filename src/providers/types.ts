/**
 * HookProvider — interfaccia per i provider di rilevamento modifiche
 *
 * Ogni provider sa come intercettare le modifiche di un tool AI specifico
 * e inviarle al server diffwatch per visualizzazione e review.
 *
 * Meccanismi supportati:
 * - 'hooks': hook CLI esterni (Claude Code — PreToolUse/PostToolUse)
 * - 'watcher': file watcher in-process (Cursor, editor generici)
 * - 'git': rilevamento via git diff (Aider, tool basati su commit)
 */

/** Evento di modifica file rilevato dal provider */
export interface FileChangeEvent {
  /** Path assoluto del file modificato */
  filePath: string;
  /** Contenuto prima della modifica (vuoto se file nuovo) */
  contentBefore: string;
  /** Contenuto dopo la modifica */
  contentAfter: string;
  /** Tool che ha fatto la modifica */
  toolName: 'Edit' | 'Write';
  /** Metadati aggiuntivi dal provider */
  metadata?: Record<string, unknown>;
}

/** Opzioni passate al provider quando viene avviato */
export interface ProviderOptions {
  /** Porta del server diffwatch */
  port: number;
  /** Directory di lavoro da monitorare */
  workDir: string;
  /** Callback quando viene rilevata una modifica */
  onFileChange: (event: FileChangeEvent) => Promise<void>;
  /** Callback per log/debug */
  onLog?: (message: string) => void;
}

/** Risultato di install/uninstall */
export interface ProviderResult {
  success: boolean;
  message: string;
}

/** Interfaccia che ogni provider deve implementare */
export interface HookProvider {
  /** Nome univoco del provider */
  readonly name: string;
  /** Descrizione leggibile */
  readonly description: string;
  /** Meccanismo di rilevamento */
  readonly mechanism: 'hooks' | 'watcher' | 'git';
  /** Supporta il review gate (blocco pre-modifica) */
  readonly supportsReviewGate: boolean;

  /**
   * Installa il provider nel sistema
   * Es: Claude Code → scrive hooks in settings.json
   *     Cursor → noop (il watcher è in-process)
   */
  install(hooksDir: string): ProviderResult;

  /**
   * Disinstalla il provider dal sistema
   */
  uninstall(): ProviderResult;

  /**
   * Verifica se il provider è installato/configurato
   */
  isInstalled(): boolean;

  /**
   * Avvia il rilevamento modifiche (per provider watcher/git)
   * Per provider 'hooks' questo è un noop (gli hook sono processi esterni)
   */
  start(options: ProviderOptions): Promise<void>;

  /**
   * Ferma il rilevamento modifiche
   */
  stop(): Promise<void>;
}

/** Registry dei provider disponibili */
export type ProviderName = 'claude-code' | 'cursor' | 'aider';
