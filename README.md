# diffwatch

**Visualizzatore diff in tempo reale per Claude Code CLI**

Intercetta ogni Edit/Write di Claude Code, mostra i diff in una web UI e ti permette di accettare o rifiutare ogni modifica con rollback istantaneo.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

<!-- TODO: aggiungere GIF demo -->

---

## Quick Start

```bash
# Installa globalmente
npm install -g @auriti/diffwatch

# Registra gli hooks in Claude Code
diffwatch install

# Avvia il server + apri browser
diffwatch start
```

Ora ogni volta che Claude Code modifica un file, vedrai il diff in tempo reale nella web UI.

---

## Come funziona

```
Claude Code CLI
     │
     ├─ PreToolUse hook ──► cattura contenuto PRIMA della modifica
     │                        │
     │                        ▼
     │                   POST /api/snapshot ──► SnapshotStore (in-memory)
     │                                              │
     │                                              ▼
     ├─ PostToolUse hook ──► legge contenuto DOPO la modifica
     │                        │                     │
     │                        ▼                     │
     │                   POST /api/applied          │
     │                                              ▼
     │                                        WebSocket broadcast
     │                                              │
     │                                              ▼
     │                                     React UI (browser)
     │                                       │         │
     │                                    Accept     Reject
     │                                    (noop)   (rollback fs)
```

1. **PreToolUse**: prima che Claude applichi una modifica, l'hook cattura il contenuto originale del file
2. **PostToolUse**: dopo la modifica, l'hook legge il nuovo contenuto e calcola il diff
3. **WebSocket**: il server notifica la UI in tempo reale
4. **Accept/Reject**: puoi accettare (nessuna azione) o rifiutare (rollback al contenuto originale)

---

## Comandi CLI

| Comando | Descrizione |
|---------|-------------|
| `diffwatch start` | Avvia server e apri browser |
| `diffwatch start --port=4000` | Porta personalizzata |
| `diffwatch start --no-open` | Senza aprire browser |
| `diffwatch install` | Registra hooks in `~/.claude/settings.json` |
| `diffwatch uninstall` | Rimuove hooks |
| `diffwatch status` | Stato hooks e server |

---

## API REST

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `/api/snapshot` | POST | Crea snapshot (chiamato da hook pre) |
| `/api/applied` | POST | Aggiorna snapshot dopo modifica (hook post) |
| `/api/changes` | GET | Lista tutti gli snapshot |
| `/api/accept` | POST | Accetta una modifica |
| `/api/reject` | POST | Rifiuta e rollback filesystem |
| `/api/accept-all` | POST | Accetta tutte le modifiche pending |
| `/api/reject-all` | POST | Rollback LIFO di tutte le pending |

---

## Configurazione

Variabili d'ambiente (opzionali):

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `DIFFWATCH_PORT` | `3333` | Porta del server |
| `DIFFWATCH_HOST` | `127.0.0.1` | Host di ascolto |

---

## Stack tecnico

- **Backend**: Express 5, WebSocket (`ws`), Node.js >= 20
- **Frontend**: React 19, diff2html
- **Build**: esbuild (TypeScript strict, ESM)
- **Hooks**: Claude Code PreToolUse / PostToolUse

---

## Sviluppo

```bash
git clone https://github.com/auriti/diffwatch.git
cd diffwatch
npm install
npm run build
npm run dev
```

---

## Roadmap

- **v0.2.0** — Test suite (vitest), sicurezza base (path validation, auth token), CI
- **v0.3.0** — Review gate (blocco pre-applicazione), persistenza SQLite, filtri UI
- **v0.4.0** — Multi-tool: supporto Cursor, Aider (abstraction layer provider)
- **v0.5.0** — UX: CSS offline, temi, keyboard shortcuts, notifiche browser
- **v1.0.0** — Pubblicazione npm, E2E test, documentazione completa

---

## Confronto

| Feature | diffwatch | difr | claude-code-hooks |
|---------|-----------|------|-------------------|
| Intercettazione real-time | ✅ | ❌ post-commit | ❌ solo log |
| Accept/Reject UI | ✅ | ❌ | ❌ |
| Rollback filesystem | ✅ | ❌ | ❌ |
| Diff visuale | ✅ | ✅ | ❌ |
| Batch operations | ✅ | ❌ | ❌ |
| Review gate (planned) | 🔜 | ❌ | ❌ |

---

## Licenza

[MIT](LICENSE) - Juan Camilo Auriti
