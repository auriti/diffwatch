# Contribuire a diffwatch

Grazie per il tuo interesse nel contribuire a diffwatch! Ecco le linee guida per contribuire al progetto.

## Setup sviluppo

```bash
git clone https://github.com/auriti/diffwatch.git
cd diffwatch
npm install
npm run build
npm test
```

### Requisiti

- Node.js >= 20
- npm >= 10

## Workflow

1. **Fork** il repository
2. Crea un **branch** dal `main`: `git checkout -b feat/mia-feature`
3. Fai le tue modifiche
4. Esegui i test: `npm test`
5. Esegui la build: `npm run build`
6. Esegui il type-check: `npm run typecheck`
7. Crea un **commit** seguendo le convenzioni (vedi sotto)
8. Apri una **Pull Request** verso `main`

## Convenzioni commit

Usiamo [Conventional Commits](https://www.conventionalcommits.org/) in italiano:

```
<tipo>(<scope>): <descrizione imperativa>
```

**Tipi:** `feat`, `fix`, `refactor`, `docs`, `perf`, `security`, `test`, `chore`

**Esempi:**
```
feat(ui): aggiungi filtro per data nella FileList
fix(hooks): correggi timeout review gate su Windows
test(e2e): aggiungi test WebSocket riconnessione
docs: aggiorna README con nuovi provider
```

## Struttura progetto

```
src/
  cli/          # Entry point CLI
  diff/         # Diff engine e rollback
  hooks/        # Hook PreToolUse/PostToolUse
  installer/    # Registrazione hook in settings.json
  providers/    # Abstraction layer multi-tool
  server/       # Express + WebSocket + store
  ui/           # React SPA (componenti, hooks, stili)
  types.ts      # Tipi condivisi
scripts/
  build.js      # Build script esbuild
tests/          # Test vitest
docs/           # Documentazione tecnica
```

## Architettura

Il flusso dati principale:

```
AI Tool → Hook (stdin JSON) → HTTP POST → Server → WebSocket → React UI
```

Ogni provider (claude-code, cursor, aider) implementa l'interfaccia `HookProvider` definita in `src/providers/types.ts`.

## Test

```bash
npm test              # Esegui tutti i test
npm run test:watch    # Test in modalità watch
npx vitest run tests/e2e.test.ts  # Solo test E2E
```

I test sono organizzati per area:
- `store.test.ts` — SnapshotStore in-memoria
- `sqlite-store.test.ts` — Persistenza SQLite
- `hooks.test.ts` — Hook pre/post tool use
- `api-routes.test.ts` — Logica API routes
- `review-gate.test.ts` — Review gate
- `providers.test.ts` — Sistema provider
- `e2e.test.ts` — Server reale HTTP + WebSocket
- `diff-engine.test.ts` — Motore diff
- `rate-limiter.test.ts` — Rate limiting

## Aggiungere un provider

Vedi la guida completa in [docs/providers.md](docs/providers.md).

In breve:
1. Crea `src/providers/nome-tool.ts` implementando `HookProvider`
2. Registralo in `src/providers/index.ts`
3. Aggiungi test in `tests/providers.test.ts`

## Issue e PR

- Cerca issue con label `good first issue` per iniziare
- Descrivi chiaramente il problema o la feature nella PR
- Includi test per le modifiche
- Assicurati che `npm test` e `npm run build` passino

## Licenza

Contribuendo a questo progetto, accetti che i tuoi contributi siano rilasciati sotto la [Licenza MIT](LICENSE).
