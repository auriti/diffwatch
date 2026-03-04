# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Panoramica

diffwatch è un visualizzatore diff in tempo reale per Claude Code CLI. Intercetta le operazioni Edit/Write tramite hooks Claude Code, mostra i diff in una web UI React e permette accept/reject con rollback sul filesystem.

## Comandi

```bash
npm run build          # esbuild → dist/ (CLI + server + hooks + UI React)
npm run dev            # Build + avvia server su http://127.0.0.1:3333
npm run start          # Avvia server (richiede build precedente)

# CLI
node dist/cli.js start              # Avvia server + apre browser
node dist/cli.js start --port=4000  # Porta custom
node dist/cli.js start --no-open    # Senza aprire browser
node dist/cli.js install            # Registra hooks in ~/.claude/settings.json
node dist/cli.js uninstall          # Rimuove hooks
node dist/cli.js status             # Stato hooks + server
```

Non c'è test runner configurato. Esiste `tests/security.test.ts` ma nessuno script di test in package.json.

## Architettura

Flusso dati: **Claude Code → Hooks (stdin JSON) → HTTP POST → Server → WebSocket → React UI**

### Hook System (intercettazione modifiche)

1. **PreToolUse** (`src/hooks/pre-tool-use.ts`): cattura `contentBefore` + calcola `expectedAfter`, invia `POST /api/snapshot`
2. **PostToolUse** (`src/hooks/post-tool-use.ts`): legge il file reale dopo la modifica, invia `POST /api/applied`

Gli hooks ricevono JSON via stdin (`HookInput`), comunicano col server via HTTP, e escono **sempre con code 0** (non bloccano mai Claude Code). Porta configurabile via `DIFFWATCH_PORT` env var.

### Server (`src/server/`)

- **Express 5** + WebSocket (`ws`) su stesso httpServer, path `/ws`
- **SnapshotStore** (`store.ts`): store in-memoria con `Map<changeId, FileSnapshot>` + indice `Map<filePath, changeId[]>`. Singleton.
- **Ciclo di vita snapshot**: `preview` → `applied` → `accepted` | `rejected`
- **Rollback** (`src/diff/rollback.ts`): verifica che il contenuto attuale corrisponda a `contentAfter` prima di sovrascrivere con `contentBefore` (conflict detection)
- **Diff engine** (`src/diff/engine.ts`): wrapper attorno a `diff.createPatch()` per formato unified

### API REST

| Endpoint | Chiamante | Funzione |
|---|---|---|
| `POST /api/snapshot` | Hook pre | Crea snapshot con before/expectedAfter |
| `POST /api/applied` | Hook post | Aggiorna snapshot con contenuto reale |
| `POST /api/rollback` | Browser | Ripristina file (verifica conflitti) |
| `POST /api/accept` | Browser | Marca come accettato (noop fs) |
| `POST /api/accept-all` | Browser | Accetta tutte le pending |
| `POST /api/reject-all` | Browser | Rollback LIFO di tutte le pending |
| `GET /api/changes` | Browser | Lista tutti gli snapshot |

### UI React (`src/ui/`)

SPA React 19 bundlata con esbuild (browser target es2020). Componenti: Header, FileList, DiffViewer, ActionBar, BatchActions. Hooks custom: `useWebSocket` (riconnessione con backoff), `useChanges` (stato modifiche).

### Build (`scripts/build.js`)

esbuild produce 6 output separati:
- `dist/cli.js` (Node ESM, banner shebang + createRequire)
- `dist/server.js` (Node ESM)
- `dist/hooks/pre-tool-use.js`, `dist/hooks/post-tool-use.js` (Node ESM, shebang)
- `dist/ui/app.js` (browser ESM, minificato), `dist/ui/app.css`

Moduli Node nativi sono `external`, i npm packages vengono bundlati.

### Installer (`src/installer/register.ts`)

Modifica `~/.claude/settings.json` aggiungendo hooks PreToolUse/PostToolUse con matcher `Edit|Write`. La rimozione filtra per command contenente "diffwatch".

## Tipi chiave (`src/types.ts`)

- `FileSnapshot`: entità centrale (changeId, filePath, contentBefore, contentAfter, status, unifiedDiff)
- `SnapshotStatus`: `'preview' | 'applied' | 'accepted' | 'rejected'`
- `HookInput`: contratto stdin degli hooks Claude Code
- `WsMessage`: messaggi WebSocket server→browser (discriminated union su `type`)
- Costanti: `DEFAULT_PORT=3333`, `HOOK_HTTP_TIMEOUT_MS=2000`

## Stack

- TypeScript strict, ESM (`"type": "module"`)
- esbuild (no tsc emit, solo type-check con `noEmit: true`)
- Express 5, ws 8, diff 7, simple-git 3, open 10
- React 19 + diff2html (rendering diff nel browser)
- Node >= 20
