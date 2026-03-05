/**
 * Test per il sistema provider
 * Issue #16, #17, #18, #19
 */

import { describe, test, expect } from 'vitest';

describe('Provider registry', () => {
  test('createProvider crea claude-code provider', async () => {
    const { createProvider } = await import('../src/providers/index.js');
    const provider = createProvider('claude-code');

    expect(provider.name).toBe('claude-code');
    expect(provider.mechanism).toBe('hooks');
    expect(provider.supportsReviewGate).toBe(true);
  });

  test('createProvider crea cursor provider', async () => {
    const { createProvider } = await import('../src/providers/index.js');
    const provider = createProvider('cursor');

    expect(provider.name).toBe('cursor');
    expect(provider.mechanism).toBe('watcher');
    expect(provider.supportsReviewGate).toBe(false);
  });

  test('createProvider crea aider provider', async () => {
    const { createProvider } = await import('../src/providers/index.js');
    const provider = createProvider('aider');

    expect(provider.name).toBe('aider');
    expect(provider.mechanism).toBe('git');
    expect(provider.supportsReviewGate).toBe(false);
  });

  test('createProvider lancia errore per provider sconosciuto', async () => {
    const { createProvider } = await import('../src/providers/index.js');
    expect(() => createProvider('unknown')).toThrow('Provider sconosciuto');
  });

  test('getAvailableProviders ritorna tutti i provider', async () => {
    const { getAvailableProviders } = await import('../src/providers/index.js');
    const providers = getAvailableProviders();

    expect(providers).toContain('claude-code');
    expect(providers).toContain('cursor');
    expect(providers).toContain('aider');
    expect(providers.length).toBe(3);
  });

  test('DEFAULT_PROVIDER è claude-code', async () => {
    const { DEFAULT_PROVIDER } = await import('../src/providers/index.js');
    expect(DEFAULT_PROVIDER).toBe('claude-code');
  });
});

describe('Claude Code provider', () => {
  test('implementa interfaccia HookProvider', async () => {
    const { ClaudeCodeProvider } = await import('../src/providers/claude-code.js');
    const provider = new ClaudeCodeProvider();

    expect(typeof provider.install).toBe('function');
    expect(typeof provider.uninstall).toBe('function');
    expect(typeof provider.isInstalled).toBe('function');
    expect(typeof provider.start).toBe('function');
    expect(typeof provider.stop).toBe('function');
    expect(provider.description).toBeDefined();
  });
});

describe('Cursor provider', () => {
  test('isInstalled ritorna sempre true', async () => {
    const { CursorProvider } = await import('../src/providers/cursor.js');
    const provider = new CursorProvider();
    expect(provider.isInstalled()).toBe(true);
  });

  test('install ritorna successo senza azione', async () => {
    const { CursorProvider } = await import('../src/providers/cursor.js');
    const provider = new CursorProvider();
    const result = provider.install('/dummy');
    expect(result.success).toBe(true);
  });
});

describe('Aider provider', () => {
  test('isInstalled verifica git', async () => {
    const { AiderProvider } = await import('../src/providers/aider.js');
    const provider = new AiderProvider();
    // git è disponibile in CI e development
    expect(provider.isInstalled()).toBe(true);
  });

  test('install ritorna successo senza azione', async () => {
    const { AiderProvider } = await import('../src/providers/aider.js');
    const provider = new AiderProvider();
    const result = provider.install('/dummy');
    expect(result.success).toBe(true);
  });
});
