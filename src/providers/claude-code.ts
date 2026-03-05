/**
 * Provider Claude Code — intercettazione via hooks CLI
 *
 * Meccanismo: hooks PreToolUse/PostToolUse registrati in ~/.claude/settings.json
 * Gli hook sono processi esterni che comunicano con il server via HTTP.
 * Il provider gestisce solo install/uninstall/check.
 */

import type { HookProvider, ProviderOptions, ProviderResult } from './types.js';
import { installHooks, uninstallHooks, checkHooksInstalled } from '../installer/register.js';

export class ClaudeCodeProvider implements HookProvider {
  readonly name = 'claude-code';
  readonly description = 'Claude Code CLI — intercettazione via hook PreToolUse/PostToolUse';
  readonly mechanism = 'hooks' as const;
  readonly supportsReviewGate = true;

  install(hooksDir: string): ProviderResult {
    return installHooks(hooksDir);
  }

  uninstall(): ProviderResult {
    return uninstallHooks();
  }

  isInstalled(): boolean {
    return checkHooksInstalled();
  }

  /** Noop — gli hook sono processi esterni avviati da Claude Code */
  async start(_options: ProviderOptions): Promise<void> {
    // Gli hook Claude Code sono processi standalone
    // Non serve avviare nulla qui — il server riceve HTTP POST dagli hook
  }

  async stop(): Promise<void> {
    // Noop
  }
}
