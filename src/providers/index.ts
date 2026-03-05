/**
 * Registry dei provider — factory per creare provider per nome
 */

import type { HookProvider, ProviderName } from './types.js';
import { ClaudeCodeProvider } from './claude-code.js';
import { CursorProvider } from './cursor.js';
import { AiderProvider } from './aider.js';

// Re-export tipi
export type { HookProvider, ProviderName, ProviderOptions, ProviderResult, FileChangeEvent } from './types.js';

/** Mappa nome → costruttore provider */
const PROVIDERS: Record<ProviderName, () => HookProvider> = {
  'claude-code': () => new ClaudeCodeProvider(),
  'cursor': () => new CursorProvider(),
  'aider': () => new AiderProvider(),
};

/**
 * Crea un provider per nome
 * @throws Error se il nome non è valido
 */
export function createProvider(name: string): HookProvider {
  const factory = PROVIDERS[name as ProviderName];
  if (!factory) {
    const available = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Provider sconosciuto: "${name}". Disponibili: ${available}`);
  }
  return factory();
}

/** Lista nomi provider disponibili */
export function getAvailableProviders(): ProviderName[] {
  return Object.keys(PROVIDERS) as ProviderName[];
}

/** Provider di default */
export const DEFAULT_PROVIDER: ProviderName = 'claude-code';
