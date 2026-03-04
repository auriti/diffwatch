/**
 * Server Express + WebSocket per diffwatch
 * Serve API per gli hooks e la UI React statica
 */

import express from 'express';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { router } from './routes.js';
import { initWebSocket } from './websocket.js';
import { DEFAULT_PORT, MAX_PORT_RETRIES } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Avvia il server diffwatch sulla porta specificata.
 * Se la porta è occupata, prova le successive.
 * @returns La porta effettivamente usata
 */
export async function startServer(preferredPort?: number): Promise<number> {
  const app = express();

  // Middleware
  app.use(express.json({ limit: '10mb' }));

  // CORS per sviluppo locale
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // API routes
  app.use(router);

  // Serve UI statica
  const uiDir = join(__dirname, 'ui');
  // In produzione (dist/), la UI è in dist/ui/
  const distUiDir = join(__dirname, '..', 'ui');
  // Fallback: cerca nella directory corrente o nella parent
  const staticDir = existsSync(uiDir) ? uiDir : existsSync(distUiDir) ? distUiDir : null;

  if (staticDir) {
    app.use(express.static(staticDir));
    // SPA fallback: tutte le route non-API servono index.html
    // Express v5 usa path-to-regexp v8: wildcard con named param
    app.get('{*path}', (_req, res) => {
      const indexPath = join(staticDir, 'index.html');
      if (existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('UI non trovata. Esegui: npm run build');
      }
    });
  } else {
    app.get('/', (_req, res) => {
      res.send(`
        <html>
          <body style="font-family: monospace; background: #1e1e2e; color: #cdd6f4; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
            <div style="text-align: center;">
              <h1>diffwatch</h1>
              <p>Server attivo. UI non ancora compilata.</p>
              <p>Esegui: <code style="background: #313244; padding: 4px 8px; border-radius: 4px;">npm run build</code></p>
            </div>
          </body>
        </html>
      `);
    });
  }

  // Crea HTTP server e aggancia WebSocket
  const httpServer = createServer(app);
  initWebSocket(httpServer);

  // Prova a fare bind sulla porta, con retry
  const port = preferredPort || DEFAULT_PORT;
  return new Promise((resolve, reject) => {
    let attempt = 0;

    function tryPort(p: number) {
      httpServer.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_RETRIES) {
          attempt++;
          const nextPort = p + 1;
          console.log(`[diffwatch] Porta ${p} occupata, provo ${nextPort}...`);
          tryPort(nextPort);
        } else {
          reject(err);
        }
      });

      httpServer.listen(p, '127.0.0.1', () => {
        console.log(`[diffwatch] Server avviato su http://127.0.0.1:${p}`);
        console.log(`[diffwatch] WebSocket su ws://127.0.0.1:${p}/ws`);
        resolve(p);
      });
    }

    tryPort(port);
  });
}
