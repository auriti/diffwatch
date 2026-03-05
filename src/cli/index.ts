/**
 * CLI diffwatch — entry point
 *
 * Comandi:
 *   diffwatch start   — Avvia server + apre browser (default)
 *   diffwatch install  — Registra hooks in Claude Code
 *   diffwatch uninstall — Rimuove hooks
 *   diffwatch status   — Mostra stato
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { startServer } from '../server/index.js';
import { DEFAULT_PORT } from '../types.js';
import { createProvider, getAvailableProviders, DEFAULT_PROVIDER } from '../providers/index.js';
import type { HookProvider } from '../providers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path alla directory dist/ (cli.js è in dist/)
const DIST_DIR = __dirname;
const HOOKS_DIR = join(DIST_DIR, 'hooks');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';

  // Opzioni
  const portArg = args.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.split('=')[1], 10) : DEFAULT_PORT;
  const noOpen = args.includes('--no-open');
  const providerArg = args.find(a => a.startsWith('--provider='));
  const providerName = providerArg ? providerArg.split('=')[1] : DEFAULT_PROVIDER;

  switch (command) {
    case 'start':
      await handleStart(port, noOpen, providerName);
      break;

    case 'install':
      handleInstall(providerName);
      break;

    case 'uninstall':
      handleUninstall(providerName);
      break;

    case 'status':
      handleStatus(providerName);
      break;

    case '--version':
    case '-v':
    case 'version':
      printVersion();
      break;

    case '--help':
    case '-h':
    case 'help':
      printHelp();
      break;

    default:
      console.error(`Comando sconosciuto: ${command}`);
      printHelp();
      process.exit(1);
  }
}

async function handleStart(port: number, noOpen: boolean, providerName: string) {
  let provider: HookProvider;
  try {
    provider = createProvider(providerName);
  } catch (err) {
    console.error(`[diffwatch] ${err}`);
    process.exit(1);
  }

  console.log('');
  console.log('  ╔══════════════════════════════╗');
  console.log('  ║       diffwatch v0.5.0       ║');
  console.log('  ║    Real-time diff viewer      ║');
  console.log('  ╚══════════════════════════════╝');
  console.log('');
  console.log(`[diffwatch] Provider: ${provider.name} (${provider.mechanism})`);

  // Per provider a hook: verifica installazione
  if (provider.mechanism === 'hooks') {
    if (!provider.isInstalled()) {
      console.log('[diffwatch] Hook non trovati. Installo automaticamente...');
      const result = provider.install(HOOKS_DIR);
      if (result.success) {
        console.log('[diffwatch] ' + result.message);
        console.log('[diffwatch] NOTA: riavvia il tool AI per attivare gli hook.');
      } else {
        console.error('[diffwatch] ' + result.message);
      }
      console.log('');
    } else {
      console.log('[diffwatch] Hook gia\' registrati.');
    }
  }

  // Avvia il server
  const actualPort = await startServer(port);

  // Per provider watcher/git: avvia rilevamento in-process
  if (provider.mechanism !== 'hooks') {
    const { store } = await import('../server/store.js');
    const { broadcast } = await import('../server/websocket.js');
    const { createUnifiedDiff } = await import('../diff/engine.js');

    await provider.start({
      port: actualPort,
      workDir: process.cwd(),
      onFileChange: async (event) => {
        // Crea snapshot e invia alla UI (stesso flusso degli hook)
        const snapshot = store.addSnapshot({
          filePath: event.filePath,
          contentBefore: event.contentBefore,
          expectedAfter: event.contentAfter,
          toolName: event.toolName,
          toolInput: event.metadata || {},
        });

        const diff = createUnifiedDiff(event.filePath, event.contentBefore, event.contentAfter);
        store.applySnapshot(event.filePath, event.contentAfter, diff);

        broadcast({
          type: 'change:applied',
          changeId: snapshot.changeId,
          filePath: event.filePath,
          diff,
          timestamp: snapshot.timestamp,
        });
      },
      onLog: (msg) => console.log(`[diffwatch] ${msg}`),
    });

    // Cleanup al segnale di uscita
    const cleanup = async () => {
      await provider.stop();
      process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  // Apri il browser
  if (!noOpen) {
    try {
      const open = (await import('open')).default;
      await open(`http://127.0.0.1:${actualPort}`);
      console.log(`[diffwatch] Browser aperto su http://127.0.0.1:${actualPort}`);
    } catch {
      console.log(`[diffwatch] Apri manualmente: http://127.0.0.1:${actualPort}`);
    }
  }

  console.log('');
  console.log(`[diffwatch] In attesa di modifiche (provider: ${provider.name})...`);
  console.log('[diffwatch] Premi Ctrl+C per fermare.');
}

function handleInstall(providerName: string) {
  const provider = createProvider(providerName);
  const result = provider.install(HOOKS_DIR);
  if (result.success) {
    console.log('✓ ' + result.message);
    if (provider.mechanism === 'hooks') {
      console.log('');
      console.log('NOTA: Riavvia il tool AI per attivare gli hook.');
    }
  } else {
    console.error('✗ ' + result.message);
    process.exit(1);
  }
}

function handleUninstall(providerName: string) {
  const provider = createProvider(providerName);
  const result = provider.uninstall();
  if (result.success) {
    console.log('✓ ' + result.message);
  } else {
    console.error('✗ ' + result.message);
    process.exit(1);
  }
}

function handleStatus(providerName: string) {
  const provider = createProvider(providerName);

  console.log('');
  console.log('diffwatch - stato:');
  console.log(`  Provider:        ${provider.name} (${provider.mechanism})`);
  console.log(`  Installato:      ${provider.isInstalled() ? '✓ Si' : '✗ No'}`);
  console.log(`  Review gate:     ${provider.supportsReviewGate ? '✓ Supportato' : '✗ Non supportato'}`);
  console.log(`  Porta default:   ${DEFAULT_PORT}`);
  console.log(`  Hooks dir:       ${HOOKS_DIR}`);
  console.log('');
  console.log(`  Provider disponibili: ${getAvailableProviders().join(', ')}`);

  // Verifica se il server è attivo
  checkServerRunning().then(running => {
    console.log(`  Server attivo:   ${running ? '✓ Si' : '✗ No'}`);
  });
}

async function checkServerRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://127.0.0.1:${DEFAULT_PORT}/api/changes`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

function printVersion() {
  // Legge versione da package.json in fase di build (hardcoded)
  console.log('diffwatch v0.5.0');
}

function printHelp() {
  const providers = getAvailableProviders().join(', ');
  console.log(`
diffwatch — Real-time diff viewer per AI coding tools

Uso:
  diffwatch [comando] [opzioni]

Comandi:
  start       Avvia il server e apre la UI nel browser (default)
  install     Registra gli hook per il provider selezionato
  uninstall   Rimuove gli hook del provider
  status      Mostra lo stato corrente
  version     Mostra la versione
  help        Mostra questo messaggio

Opzioni:
  --port=N          Porta del server (default: ${DEFAULT_PORT})
  --no-open         Non aprire il browser automaticamente
  --provider=NAME   Provider da usare (default: ${DEFAULT_PROVIDER})
                    Disponibili: ${providers}

Provider:
  claude-code   Hook CLI PreToolUse/PostToolUse (supporta review gate)
  cursor        File watcher in-process (Cursor, VS Code, editor generici)
  aider         Git diff polling (Aider, tool basati su commit)

Esempi:
  diffwatch                              # Avvia con Claude Code (default)
  diffwatch start --provider=cursor      # Avvia con file watcher
  diffwatch start --provider=aider       # Avvia con git polling
  diffwatch start --port=4000            # Porta custom
  diffwatch install --provider=claude-code  # Solo registra hook
`);
}

main().catch((err) => {
  console.error('[diffwatch] Errore fatale:', err);
  process.exit(1);
});
