/**
 * Hook React per connessione WebSocket con reconnect automatico
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { WsMessage } from '../../types.js';
import { WS_RECONNECT_BASE_MS, WS_RECONNECT_MAX_MS } from '../../types.js';

type MessageHandler = (message: WsMessage) => void;

interface UseWebSocketReturn {
  /** true se connesso */
  connected: boolean;
  /** Registra un handler per i messaggi */
  onMessage: (handler: MessageHandler) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<MessageHandler[]>([]);
  const reconnectDelayRef = useRef(WS_RECONNECT_BASE_MS);

  const connect = useCallback(() => {
    // Determina URL WebSocket dalla pagina corrente
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      reconnectDelayRef.current = WS_RECONNECT_BASE_MS; // Reset delay
    };

    ws.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        handlersRef.current.forEach(handler => handler(message));
      } catch {
        // Messaggio non valido — ignora
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Reconnect con backoff esponenziale
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, WS_RECONNECT_MAX_MS);
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const onMessage = useCallback((handler: MessageHandler) => {
    handlersRef.current.push(handler);
  }, []);

  return { connected, onMessage };
}
