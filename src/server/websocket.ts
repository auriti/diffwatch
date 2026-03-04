/**
 * WebSocket manager — broadcast messaggi a tutti i client connessi
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WsMessage } from '../types.js';

let wss: WebSocketServer | null = null;

/**
 * Inizializza il WebSocket server agganciandolo al server HTTP
 */
export function initWebSocket(httpServer: Server): WebSocketServer {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    // Invia messaggio di benvenuto
    const welcome: WsMessage = { type: 'connection', status: 'connected' };
    ws.send(JSON.stringify(welcome));

    ws.on('error', (err) => {
      console.error('[diffwatch] Errore WebSocket client:', err.message);
    });
  });

  // Heartbeat per rilevare connessioni rotte
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  wss.on('close', () => {
    clearInterval(interval);
  });

  return wss;
}

/**
 * Invia un messaggio a tutti i client WebSocket connessi
 */
export function broadcast(message: WsMessage): void {
  if (!wss) return;

  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}
