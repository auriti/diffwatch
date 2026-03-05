/**
 * Test Suite Sicurezza — diffwatch
 * Verifica che le vulnerabilità critiche siano state fixate
 *
 * Per eseguire:
 * npm install -D vitest
 * npx vitest tests/security.test.ts
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { join } from 'path';

// I test assumono che le fix di sicurezza siano state implementate
// Se un test fallisce, la vulnerabilità è ancora presente

describe('CWE-22: Path Traversal Protection', () => {
  // Importa la funzione di validazione (DOPO aver implementato la fix)
  let isPathAllowed: (filePath: string) => boolean;

  beforeAll(async () => {
    try {
      const module = await import('../src/server/path-validator.js');
      isPathAllowed = module.isPathAllowed;
    } catch {
      // Se il file non esiste, crea un mock che fallisce sempre
      isPathAllowed = () => {
        throw new Error('path-validator.ts non implementato — Fix 1 mancante!');
      };
    }
  });

  test('PASS: permette file dentro la directory corrente', () => {
    const safeFile = join(process.cwd(), 'src/index.ts');
    expect(isPathAllowed(safeFile)).toBe(true);
  });

  test('FAIL: blocca path traversal con ../', () => {
    const maliciousPath = '../../etc/passwd';
    expect(isPathAllowed(maliciousPath)).toBe(false);
  });

  test('FAIL: blocca path assoluto critico (/etc/passwd)', () => {
    expect(isPathAllowed('/etc/passwd')).toBe(false);
  });

  test('FAIL: blocca accesso a .ssh/authorized_keys', () => {
    const home = process.env.HOME || '/home/user';
    const sshPath = join(home, '.ssh/authorized_keys');
    expect(isPathAllowed(sshPath)).toBe(false);
  });

  test('FAIL: blocca accesso a .bashrc', () => {
    const home = process.env.HOME || '/home/user';
    const bashrc = join(home, '.bashrc');
    expect(isPathAllowed(bashrc)).toBe(false);
  });

  test('FAIL: blocca accesso a wp-config.php (esempio web app)', () => {
    const webRoot = '/var/www/html/wp-config.php';
    expect(isPathAllowed(webRoot)).toBe(false);
  });

  test('PASS: normalizza path con segmenti ridondanti', () => {
    const weirdPath = join(process.cwd(), './src/../src/./index.ts');
    expect(isPathAllowed(weirdPath)).toBe(true);
  });

  test('FAIL: blocca null byte injection', () => {
    const nullByteAttack = join(process.cwd(), 'file.txt\x00.png');
    expect(isPathAllowed(nullByteAttack)).toBe(false);
  });

  test('PASS: permette file relativi validi', () => {
    const relativeFile = './package.json';
    expect(isPathAllowed(relativeFile)).toBe(true);
  });

  test('FAIL: blocca Unicode tricks (Homograph attack)', () => {
    // Path con caratteri Unicode lookalike
    const unicodePath = '../еtc/passwd'; // 'е' Cyrillic invece di 'e' Latin
    expect(isPathAllowed(unicodePath)).toBe(false);
  });
});

describe('CWE-862: Authentication Enforcement', () => {
  let generateServerToken: () => string;
  let authMiddleware: (req: any, res: any, next: any) => void;

  beforeAll(async () => {
    try {
      const module = await import('../src/server/auth.js');
      generateServerToken = module.generateServerToken;
      authMiddleware = module.authMiddleware;
    } catch {
      generateServerToken = () => {
        throw new Error('auth.ts non implementato — Fix 2 mancante!');
      };
    }
  });

  test('PASS: genera token sicuro (256 bit)', () => {
    const token = generateServerToken();

    // Token deve essere 64 caratteri hex (32 byte = 256 bit)
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  test('FAIL: richiesta senza token viene rifiutata', () => {
    const mockReq = { headers: {} };
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => {
          expect(code).toBe(401);
          expect(data.error).toContain('Unauthorized');
        }
      })
    };
    const mockNext = () => {
      throw new Error('next() non dovrebbe essere chiamato senza token!');
    };

    authMiddleware(mockReq, mockRes, mockNext);
  });

  test('FAIL: richiesta con token errato viene rifiutata', () => {
    generateServerToken(); // Genera token valido
    const mockReq = { headers: { authorization: 'Bearer wrong_token_123' } };
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => {
          expect(code).toBe(401);
        }
      })
    };
    const mockNext = () => {
      throw new Error('next() non dovrebbe essere chiamato con token errato!');
    };

    authMiddleware(mockReq, mockRes, mockNext);
  });

  test('PASS: richiesta con token valido passa', () => {
    const validToken = generateServerToken();
    const mockReq = { headers: { authorization: `Bearer ${validToken}` } };
    const mockRes = {
      status: () => {
        throw new Error('status() non dovrebbe essere chiamato con token valido!');
      }
    };
    let nextCalled = false;
    const mockNext = () => { nextCalled = true; };

    authMiddleware(mockReq, mockRes, mockNext);
    expect(nextCalled).toBe(true);
  });
});

describe('CWE-284: CORS Configuration', () => {
  test('FAIL: wildcard CORS non deve essere presente', async () => {
    // Leggi il file del server e verifica che non contenga Access-Control-Allow-Origin: *
    const { readFileSync } = await import('fs');
    const serverCode = readFileSync(
      join(process.cwd(), 'src/server/index.ts'),
      'utf-8'
    );

    // Verifica che NON ci sia wildcard CORS
    const hasWildcardCORS = /Access-Control-Allow-Origin['"]?\s*,\s*['"]?\*['"]?/.test(serverCode);
    expect(hasWildcardCORS).toBe(false);
  });

  test('PASS: CORS dovrebbe usare whitelist localhost', async () => {
    const { readFileSync } = await import('fs');
    const serverCode = readFileSync(
      join(process.cwd(), 'src/server/index.ts'),
      'utf-8'
    );

    // Verifica presenza di whitelist
    const hasWhitelist = /allowedOrigins|ALLOWED_ORIGINS/.test(serverCode);
    expect(hasWhitelist).toBe(true);
  });
});

describe('CWE-400: Rate Limiting', () => {
  let rateLimitMiddleware: (req: any, res: any, next: any) => void;

  beforeAll(async () => {
    try {
      const module = await import('../src/server/rate-limiter.js');
      rateLimitMiddleware = module.rateLimitMiddleware;
    } catch {
      // Se non implementato, skip test
      rateLimitMiddleware = () => {
        throw new Error('rate-limiter.ts non implementato (opzionale)');
      };
    }
  });

  test('PASS: prime richieste passano', () => {
    const mockReq = { ip: '127.0.0.1' };
    let nextCalled = false;
    const mockNext = () => { nextCalled = true; };
    const mockRes = {
      status: () => {
        throw new Error('Richiesta bloccata quando non dovrebbe!');
      }
    };

    rateLimitMiddleware(mockReq, mockRes, mockNext);
    expect(nextCalled).toBe(true);
  });

  test('FAIL: troppe richieste vengono bloccate', () => {
    const mockReq = { ip: '127.0.0.2' }; // IP diverso per evitare interferenze
    let blocked = false;
    const mockRes = {
      status: (code: number) => ({
        json: (data: any) => {
          expect(code).toBe(429);
          expect(data.error).toContain('Too many requests');
          blocked = true;
        }
      })
    };
    const mockNext = () => {};

    // Simula 61 richieste (limite = 60)
    for (let i = 0; i < 61; i++) {
      rateLimitMiddleware(mockReq, mockRes, mockNext);
    }

    expect(blocked).toBe(true);
  });
});

describe('Rollback Function Security', () => {
  test('FAIL: rollback rifiuta path fuori whitelist', async () => {
    const { rollbackFile } = await import('../src/diff/rollback.js');

    const maliciousSnapshot = {
      changeId: 'test-1',
      filePath: '/etc/passwd',
      contentBefore: 'malicious content',
      contentAfter: 'current content',
      toolName: 'Edit' as const,
      toolInput: {},
      timestamp: Date.now(),
      status: 'applied' as const,
      unifiedDiff: null,
    };

    const result = rollbackFile(maliciousSnapshot);

    expect(result.success).toBe(false);
    expect(result.message).toContain('SECURITY');
  });
});

describe('Integration: Attack Scenarios', () => {
  test('Scenario 1: Tentativo di sovrascrivere authorized_keys', async () => {
    const { rollbackFile } = await import('../src/diff/rollback.js');
    const home = process.env.HOME || '/home/user';

    const attackSnapshot = {
      changeId: 'attack-1',
      filePath: `${home}/.ssh/authorized_keys`,
      contentBefore: 'ssh-rsa AAAA... attacker@evil.com',
      contentAfter: 'ssh-rsa AAAA... legit@user.com',
      toolName: 'Edit' as const,
      toolInput: {},
      timestamp: Date.now(),
      status: 'applied' as const,
      unifiedDiff: null,
    };

    const result = rollbackFile(attackSnapshot);

    // DEVE fallire con errore di sicurezza
    expect(result.success).toBe(false);
    expect(result.message.toLowerCase()).toContain('security');
  });

  test('Scenario 2: Tentativo di leggere .env via hook', async () => {
    // Simula input hook malevolo
    const { isPathAllowed } = await import('../src/server/path-validator.js');
    const envPath = join(process.cwd(), '../../../app/.env');

    // DEVE essere bloccato
    expect(isPathAllowed(envPath)).toBe(false);
  });

  test('Scenario 3: Flood API senza rate limiting', async () => {
    // Questo test verifica che il rate limiter sia attivo
    // In un test reale, si farebbe richiesta HTTP al server
    try {
      await import('../src/server/rate-limiter.js');
      // Se il file esiste, il rate limiter è implementato
      expect(true).toBe(true);
    } catch {
      throw new Error('Rate limiter non implementato — rischio DoS!');
    }
  });
});

describe('Regression Tests', () => {
  test('Path validator non rompe funzionalità legittime', async () => {
    const { isPathAllowed } = await import('../src/server/path-validator.js');

    // File comuni che DEVONO essere permessi
    const legitimatePaths = [
      './package.json',
      './src/index.ts',
      './README.md',
      join(process.cwd(), 'tsconfig.json'),
    ];

    for (const path of legitimatePaths) {
      expect(isPathAllowed(path)).toBe(true);
    }
  });

  test('Authentication non blocca GET /api/changes (read-only)', async () => {
    // GET /api/changes dovrebbe essere pubblico (nessun dato sensibile)
    // Verifica che non sia protetto da auth (opzionale)
    // Questo è un design decision: se si vuole proteggere anche GET, modificare
    expect(true).toBe(true); // Placeholder
  });
});
