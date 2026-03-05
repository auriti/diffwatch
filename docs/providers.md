# Guida Provider — Integrazione nuovi tool AI

diffwatch supporta diversi tool AI tramite il sistema **provider**. Ogni provider sa come rilevare le modifiche file di uno specifico tool e inviarle al server per visualizzazione e review.

## Provider disponibili

| Provider | Meccanismo | Review Gate | Tool supportati |
|----------|-----------|-------------|-----------------|
| `claude-code` | Hook CLI | ✅ Si | Claude Code |
| `cursor` | File watcher | ❌ No | Cursor, VS Code, editor generici |
| `aider` | Git polling | ❌ No | Aider, tool basati su commit |

## Uso

```bash
# Claude Code (default)
diffwatch start

# Cursor / VS Code
diffwatch start --provider=cursor

# Aider
diffwatch start --provider=aider
```

## Come funzionano

### claude-code (hooks)
Registra hook in `~/.claude/settings.json`. Claude Code esegue gli hook come processi esterni prima e dopo ogni Edit/Write. Gli hook comunicano col server via HTTP POST.

### cursor (file watcher)
Monitora il filesystem con `fs.watch` in modalità ricorsiva. Rileva modifiche ai file con estensioni note (`.ts`, `.py`, `.go`, etc.) e ignora `node_modules`, `.git`, etc. Debounce di 200ms per evitare eventi duplicati.

### aider (git polling)
Controlla ogni 2 secondi se ci sono nuovi commit git. Quando rileva un commit, analizza il diff e invia le modifiche al server. Funziona con qualsiasi tool che committa automaticamente.

## Creare un nuovo provider

Per aggiungere un nuovo provider, implementa l'interfaccia `HookProvider`:

```typescript
import type { HookProvider, ProviderOptions, ProviderResult } from './types.js';

export class MyProvider implements HookProvider {
  readonly name = 'my-tool';
  readonly description = 'Descrizione del provider';
  readonly mechanism = 'watcher'; // 'hooks' | 'watcher' | 'git'
  readonly supportsReviewGate = false;

  install(hooksDir: string): ProviderResult {
    // Setup necessario (o noop)
    return { success: true, message: 'Installato' };
  }

  uninstall(): ProviderResult {
    return { success: true, message: 'Disinstallato' };
  }

  isInstalled(): boolean {
    return true;
  }

  async start(options: ProviderOptions): Promise<void> {
    // Avvia il rilevamento modifiche
    // Chiama options.onFileChange(event) per ogni modifica
  }

  async stop(): Promise<void> {
    // Ferma il rilevamento
  }
}
```

### Registrare il provider

In `src/providers/index.ts`:

```typescript
import { MyProvider } from './my-provider.js';

const PROVIDERS = {
  // ... provider esistenti
  'my-tool': () => new MyProvider(),
};
```

Aggiorna anche il tipo `ProviderName` in `src/providers/types.ts`.

### FileChangeEvent

Ogni modifica rilevata deve produrre un `FileChangeEvent`:

```typescript
interface FileChangeEvent {
  filePath: string;      // Path assoluto
  contentBefore: string; // Contenuto precedente (vuoto se file nuovo)
  contentAfter: string;  // Contenuto attuale
  toolName: 'Edit' | 'Write';
  metadata?: Record<string, unknown>; // Dati specifici del provider
}
```

### Test

Aggiungi test in `tests/providers.test.ts` per verificare:
- Creazione del provider via factory
- Proprietà (name, mechanism, supportsReviewGate)
- install/uninstall/isInstalled
- start/stop (se il provider ha logica in-process)
