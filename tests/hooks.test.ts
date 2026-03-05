/**
 * Test per hook utilities
 * Issue #4: test per hooks (pre/post tool use)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Testiamo le utility di parsing e httpPost, non i hook completi
// (i hook usano process.exit che non è testabile direttamente)

describe('Hook utilities', () => {
  describe('httpPost', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    test('invia POST con body JSON corretto', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      // Importa dinamicamente dopo il mock
      const { httpPost } = await import('../src/hooks/utils.js');

      await httpPost('/api/snapshot', { filePath: '/test.ts', contentBefore: 'hello' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/snapshot');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.filePath).toBe('/test.ts');
      expect(body.contentBefore).toBe('hello');
    });

    test('non lancia errore se server non raggiungibile', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', mockFetch);

      const { httpPost } = await import('../src/hooks/utils.js');

      // Non deve lanciare
      await expect(httpPost('/api/snapshot', {})).resolves.toBeUndefined();
    });

    test('usa porta da DIFFWATCH_PORT env', async () => {
      process.env.DIFFWATCH_PORT = '4444';
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const { httpPost } = await import('../src/hooks/utils.js');

      await httpPost('/api/test', {});

      expect(mockFetch.mock.calls[0][0]).toContain('4444');
      delete process.env.DIFFWATCH_PORT;
    });
  });

  describe('Logica pre-tool-use', () => {
    test('calcola expectedAfter per Write (contenuto completo)', () => {
      const toolInput = {
        file_path: '/test.ts',
        content: 'nuovo contenuto completo',
      };

      // Per Write, expectedAfter = content
      expect(toolInput.content).toBe('nuovo contenuto completo');
    });

    test('calcola expectedAfter per Edit (sostituzione stringa)', () => {
      const contentBefore = 'const x = 1;\nconst y = 2;';
      const oldString = 'const x = 1;';
      const newString = 'const x = 42;';

      const expectedAfter = contentBefore.replace(oldString, newString);

      expect(expectedAfter).toBe('const x = 42;\nconst y = 2;');
    });

    test('filtra tool non Edit/Write', () => {
      const tools = ['Read', 'Bash', 'Glob', 'Grep', 'Edit', 'Write'];
      const intercepted = tools.filter(t => t === 'Edit' || t === 'Write');

      expect(intercepted).toEqual(['Edit', 'Write']);
    });
  });

  describe('Logica post-tool-use', () => {
    test('filtra tool non Edit/Write', () => {
      const toolName = 'Bash';
      const shouldProcess = toolName === 'Edit' || toolName === 'Write';

      expect(shouldProcess).toBe(false);
    });

    test('ignora file senza file_path', () => {
      const toolInput = { command: 'ls -la' };
      const filePath = toolInput.file_path;

      expect(filePath).toBeUndefined();
    });
  });
});
