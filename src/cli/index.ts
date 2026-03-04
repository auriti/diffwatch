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
import { installHooks, uninstallHooks, checkHooksInstalled } from '../installer/register.js';
import { DEFAULT_PORT } from '../types.js';

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

  switch (command) {
    case 'start':
      await handleStart(port, noOpen);
      break;

    case 'install':
      handleInstall();
      break;

    case 'uninstall':
      handleUninstall();
      break;

    case 'status':
      handleStatus();
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

async function handleStart(port: number, noOpen: boolean) {
  console.log('');
  console.log('  ╔══════════════════════════════╗');
  console.log('  ║       diffwatch v0.1.0       ║');
  console.log('  ║  Real-time diff per Claude   ║');
  console.log('  ╚══════════════════════════════╝');
  console.log('');

  // Verifica hooks installati, installa se necessario
  if (!checkHooksInstalled()) {
    console.log('[diffwatch] Hook non trovati. Installo automaticamente...');
    const result = installHooks(HOOKS_DIR);
    if (result.success) {
      console.log('[diffwatch] ' + result.message);
      console.log('[diffwatch] NOTA: riavvia Claude Code per attivare gli hook.');
    } else {
      console.error('[diffwatch] ' + result.message);
    }
    console.log('');
  } else {
    console.log('[diffwatch] Hook gia\' registrati.');
  }

  // Avvia il server
  const actualPort = await startServer(port);

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
  console.log('[diffwatch] In attesa di modifiche da Claude Code...');
  console.log('[diffwatch] Premi Ctrl+C per fermare.');
}

function handleInstall() {
  const result = installHooks(HOOKS_DIR);
  if (result.success) {
    console.log('✓ ' + result.message);
    console.log('');
    console.log('NOTA: Riavvia Claude Code per attivare gli hook.');
  } else {
    console.error('✗ ' + result.message);
    process.exit(1);
  }
}

function handleUninstall() {
  const result = uninstallHooks();
  if (result.success) {
    console.log('✓ ' + result.message);
  } else {
    console.error('✗ ' + result.message);
    process.exit(1);
  }
}

function handleStatus() {
  const hooksInstalled = checkHooksInstalled();

  console.log('');
  console.log('diffwatch - stato:');
  console.log(`  Hook registrati: ${hooksInstalled ? '✓ Si' : '✗ No'}`);
  console.log(`  Porta default:   ${DEFAULT_PORT}`);
  console.log(`  Hooks dir:       ${HOOKS_DIR}`);
  console.log('');

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

function printHelp() {
  console.log(`
diffwatch — Real-time diff viewer per Claude Code CLI

Uso:
  diffwatch [comando] [opzioni]

Comandi:
  start       Avvia il server e apre la UI nel browser (default)
  install     Registra gli hook in Claude Code
  uninstall   Rimuove gli hook da Claude Code
  status      Mostra lo stato corrente
  help        Mostra questo messaggio

Opzioni:
  --port=N    Porta del server (default: ${DEFAULT_PORT})
  --no-open   Non aprire il browser automaticamente

Esempi:
  diffwatch                    # Avvia con impostazioni default
  diffwatch start --port=4000  # Avvia su porta 4000
  diffwatch install            # Solo registra hook
  diffwatch uninstall          # Rimuovi hook
`);
}

main().catch((err) => {
  console.error('[diffwatch] Errore fatale:', err);
  process.exit(1);
});
