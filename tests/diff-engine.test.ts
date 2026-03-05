/**
 * Test unitari per diff engine e rollback
 * Issue #3: test unitari per diff engine e rollback
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { createUnifiedDiff } from '../src/diff/engine.js';
import { rollbackFile, type RollbackResult } from '../src/diff/rollback.js';
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { FileSnapshot } from '../src/types.js';

// --- Diff Engine ---

describe('createUnifiedDiff', () => {
  test('genera diff per modifica semplice', () => {
    const diff = createUnifiedDiff('/test/file.ts', 'const x = 1;', 'const x = 2;');

    expect(diff).toContain('---');
    expect(diff).toContain('+++');
    expect(diff).toContain('-const x = 1;');
    expect(diff).toContain('+const x = 2;');
  });

  test('genera diff vuoto per contenuto identico', () => {
    const diff = createUnifiedDiff('/test/file.ts', 'same', 'same');

    // diff non contiene righe + o -
    expect(diff).not.toContain('\n-same');
    expect(diff).not.toContain('\n+same');
  });

  test('gestisce file vuoto → contenuto', () => {
    const diff = createUnifiedDiff('/test/file.ts', '', 'new content');

    expect(diff).toContain('+new content');
  });

  test('gestisce contenuto → file vuoto', () => {
    const diff = createUnifiedDiff('/test/file.ts', 'old content', '');

    expect(diff).toContain('-old content');
  });

  test('gestisce contenuto multilinea', () => {
    const before = 'line1\nline2\nline3';
    const after = 'line1\nmodified\nline3';

    const diff = createUnifiedDiff('/test/file.ts', before, after);

    expect(diff).toContain('-line2');
    expect(diff).toContain('+modified');
  });

  test('accorcia path lunghi', () => {
    const longPath = '/home/user/very/deep/nested/project/src/file.ts';
    const diff = createUnifiedDiff(longPath, 'a', 'b');

    // Il path nell'header dovrebbe essere accorciato
    expect(diff).toBeDefined();
    expect(diff.length).toBeGreaterThan(0);
  });
});

// --- Rollback ---

describe('rollbackFile', () => {
  const tmpDir = join(process.cwd(), '.test-tmp');
  const testFile = join(tmpDir, 'rollback-test.txt');

  const makeSnapshot = (overrides?: Partial<FileSnapshot>): FileSnapshot => ({
    changeId: 'test-rollback-1',
    filePath: testFile,
    contentBefore: 'contenuto originale',
    contentAfter: 'contenuto modificato',
    toolName: 'Edit',
    toolInput: {},
    timestamp: Date.now(),
    status: 'applied',
    unifiedDiff: null,
    ...overrides,
  });

  beforeEach(() => {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  });

  test('ripristina file quando contentAfter corrisponde', () => {
    writeFileSync(testFile, 'contenuto modificato', 'utf-8');

    const result = rollbackFile(makeSnapshot());

    expect(result.success).toBe(true);
    expect(result.conflict).toBe(false);
    expect(readFileSync(testFile, 'utf-8')).toBe('contenuto originale');
  });

  test('rileva conflitto quando file è stato ri-modificato', () => {
    writeFileSync(testFile, 'contenuto diverso dal previsto', 'utf-8');

    const result = rollbackFile(makeSnapshot());

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
    // Il file non deve essere stato toccato
    expect(readFileSync(testFile, 'utf-8')).toBe('contenuto diverso dal previsto');
  });

  test('fallisce se file non esiste', () => {
    const result = rollbackFile(makeSnapshot({ filePath: join(tmpDir, 'nonexistent.txt') }));

    expect(result.success).toBe(false);
    expect(result.conflict).toBe(false);
    expect(result.message).toContain('non trovato');
  });

  test('fallisce se contentAfter è null', () => {
    const result = rollbackFile(makeSnapshot({ contentAfter: null }));

    expect(result.success).toBe(false);
    expect(result.message).toContain('contentAfter');
  });
});
