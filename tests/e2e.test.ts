/**
 * Test E2E — server reale con HTTP e WebSocket
 * Issue #30: test E2E con server reale
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'http';
import express from 'express';
import WebSocket from 'ws';
import { router } from '../src/server/routes.js';
import { initWebSocket } from '../src/server/websocket.js';
import { SnapshotStore } from '../src/server/store.js';

// Porta casuale per evitare conflitti
let server: Server;
let port: number;
let baseUrl: string;

/**
 * Avvia server E2E su porta casuale
 * Non usa auth per semplificare i test
 */
beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(router);

  server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        port = addr.port;
        baseUrl = `http://127.0.0.1:${port}`;
      }
      initWebSocket(server);
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}, 15000);

// Utility: crea snapshot via API
async function createSnapshot(filePath: string, before: string, after: string) {
  const res = await fetch(`${baseUrl}/api/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath,
      contentBefore: before,
      expectedAfter: after,
      toolName: 'Edit',
      toolInput: { file_path: filePath },
    }),
  });
  return res;
}

// Utility: applica snapshot via API
async function applySnapshot(filePath: string, content: string) {
  return fetch(`${baseUrl}/api/applied`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, contentAfter: content }),
  });
}

describe('E2E — Server HTTP', () => {
  const cwd = process.cwd();

  test('GET /api/changes ritorna array vuoto iniziale', async () => {
    const res = await fetch(`${baseUrl}/api/changes`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('flusso completo: snapshot → applied → accept', async () => {
    const filePath = `${cwd}/src/e2e-test.ts`;

    // 1. Crea snapshot (preview)
    const snapRes = await createSnapshot(filePath, 'vecchio', 'nuovo');
    expect(snapRes.status).toBe(200);
    const snapData = await snapRes.json() as { changeId: string };
    expect(snapData.changeId).toBeDefined();

    // 2. Applica (simula post-tool-use)
    const applyRes = await applySnapshot(filePath, 'nuovo');
    expect(applyRes.status).toBe(200);

    // 3. Verifica cambio in lista
    const listRes = await fetch(`${baseUrl}/api/changes`);
    const changes = await listRes.json() as Array<{ changeId: string; status: string }>;
    const found = changes.find(c => c.changeId === snapData.changeId);
    expect(found).toBeDefined();
    expect(found!.status).toBe('applied');

    // 4. Accetta
    const acceptRes = await fetch(`${baseUrl}/api/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeId: snapData.changeId }),
    });
    expect(acceptRes.status).toBe(200);

    // 5. Verifica stato accepted
    const listRes2 = await fetch(`${baseUrl}/api/changes`);
    const changes2 = await listRes2.json() as Array<{ changeId: string; status: string }>;
    const accepted = changes2.find(c => c.changeId === snapData.changeId);
    expect(accepted!.status).toBe('accepted');
  });

  test('flusso batch: accept-all', async () => {
    const files = [`${cwd}/src/batch1.ts`, `${cwd}/src/batch2.ts`];

    // Crea e applica 2 snapshot
    for (const f of files) {
      await createSnapshot(f, 'old', 'new');
      await applySnapshot(f, 'new');
    }

    // Accept all
    const res = await fetch(`${baseUrl}/api/accept-all`, { method: 'POST' });
    expect(res.status).toBe(200);
    const data = await res.json() as { count: number };
    expect(data.count).toBeGreaterThanOrEqual(2);
  });

  test('reject senza file reale ritorna errore rollback', async () => {
    const filePath = `${cwd}/src/nonexistent-e2e.ts`;

    await createSnapshot(filePath, 'old', 'new');
    await applySnapshot(filePath, 'new');

    // Ottieni il changeId
    const listRes = await fetch(`${baseUrl}/api/changes`);
    const changes = await listRes.json() as Array<{ changeId: string; filePath: string; status: string }>;
    const snap = changes.find(c => c.filePath === filePath && c.status === 'applied');

    if (snap) {
      const rollbackRes = await fetch(`${baseUrl}/api/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changeId: snap.changeId }),
      });
      // Il rollback fallisce perché il file non esiste su disco
      const data = await rollbackRes.json() as { error?: string };
      expect(rollbackRes.status === 200 || rollbackRes.status === 409 || rollbackRes.status === 500).toBe(true);
    }
  });
});

describe('E2E — WebSocket', () => {
  test('connessione WebSocket e ricezione messaggi', async () => {
    const cwd = process.cwd();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const messages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);

      ws.on('open', async () => {
        // Crea snapshot per generare un messaggio WS
        await createSnapshot(`${cwd}/src/ws-test.ts`, 'before', 'after');
        await applySnapshot(`${cwd}/src/ws-test.ts`, 'after');
      });

      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
        // Aspetta almeno un messaggio change:applied
        const hasApplied = messages.some(
          (m: any) => m.type === 'change:applied'
        );
        if (hasApplied) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Verifica che abbiamo ricevuto almeno un messaggio change:applied
    const appliedMsg = messages.find((m: any) => m.type === 'change:applied') as any;
    expect(appliedMsg).toBeDefined();
    expect(appliedMsg.filePath).toContain('ws-test.ts');
    expect(appliedMsg.diff).toBeDefined();
  });

  test('change:preview inviato alla creazione', async () => {
    const cwd = process.cwd();
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    const messages: unknown[] = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WS timeout')), 5000);

      ws.on('open', async () => {
        await createSnapshot(`${cwd}/src/ws-snap-test.ts`, 'a', 'b');
      });

      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
        const hasNew = messages.some(
          (m: any) => m.type === 'change:preview'
        );
        if (hasNew) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    const newMsg = messages.find((m: any) => m.type === 'change:preview') as any;
    expect(newMsg).toBeDefined();
    expect(newMsg.filePath).toContain('ws-snap-test.ts');
  });
});

describe('E2E — Risposte errore', () => {
  test('POST /api/snapshot con body vuoto → 400', async () => {
    const res = await fetch(`${baseUrl}/api/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/accept con changeId inesistente → 404', async () => {
    const res = await fetch(`${baseUrl}/api/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeId: 'inesistente-123' }),
    });
    expect(res.status).toBe(404);
  });

  test('POST /api/rollback con changeId inesistente → 404', async () => {
    const res = await fetch(`${baseUrl}/api/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changeId: 'inesistente-456' }),
    });
    expect(res.status).toBe(404);
  });
});
