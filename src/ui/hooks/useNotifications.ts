/**
 * Hook per notifiche browser su nuove modifiche
 * Richiede il permesso dell'utente al primo uso
 */

import { useEffect, useRef } from 'react';
import type { WsMessage } from '../../types.js';

export function useNotifications(onMessage: (handler: (msg: WsMessage) => void) => void): void {
  const permissionRef = useRef<NotificationPermission>('default');

  // Richiedi permesso notifiche
  useEffect(() => {
    if (!('Notification' in window)) return;

    permissionRef.current = Notification.permission;

    if (Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        permissionRef.current = perm;
      });
    }
  }, []);

  // Ascolta messaggi WS per nuove modifiche
  useEffect(() => {
    onMessage((msg: WsMessage) => {
      if (permissionRef.current !== 'granted') return;
      // Notifica solo se la pagina non è in focus
      if (document.hasFocus()) return;

      if (msg.type === 'change:applied') {
        const fileName = msg.filePath.split('/').pop() || msg.filePath;
        new Notification('diffwatch — Nuova modifica', {
          body: `${fileName} modificato`,
          icon: '/favicon.ico',
          tag: msg.changeId, // Evita notifiche duplicate
        });
      }

      if (msg.type === 'review:request') {
        const fileName = msg.filePath.split('/').pop() || msg.filePath;
        new Notification('diffwatch — Review richiesta', {
          body: `Approva o rifiuta: ${fileName} (${msg.toolName})`,
          icon: '/favicon.ico',
          tag: msg.changeId,
          requireInteraction: true, // Resta finché l'utente non interagisce
        });
      }
    });
  }, [onMessage]);
}
