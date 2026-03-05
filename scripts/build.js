#!/usr/bin/env node

/**
 * Script di build per diffwatch
 * Usa esbuild per bundlare 4 entry points separati + UI
 */

import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Opzioni condivise per bundle Node.js
const nodeCommon = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: false,
  minify: false,
  // Banner per supporto require() in ESM
  banner: {
    js: `import { createRequire } from 'module'; const require = createRequire(import.meta.url);`
  },
  external: [
    // Moduli nativi Node — non bundlare
    'fs', 'path', 'url', 'http', 'https', 'net', 'os', 'child_process',
    'crypto', 'stream', 'events', 'util', 'buffer', 'querystring',
    'readline', 'zlib', 'tty', 'assert',
    // Moduli nativi npm — richiedono compilazione
    'better-sqlite3',
  ],
};

async function buildAll() {
  console.log('🔨 Building diffwatch...\n');

  // 1. CLI
  await build({
    ...nodeCommon,
    entryPoints: [join(ROOT, 'src/cli/index.ts')],
    outfile: join(ROOT, 'dist/cli.js'),
    banner: {
      js: `#!/usr/bin/env node\n${nodeCommon.banner.js}`
    },
  });
  console.log('  ✓ dist/cli.js');

  // 2. Server
  await build({
    ...nodeCommon,
    entryPoints: [join(ROOT, 'src/server/index.ts')],
    outfile: join(ROOT, 'dist/server.js'),
  });
  console.log('  ✓ dist/server.js');

  // 3. Hook PreToolUse
  await build({
    ...nodeCommon,
    entryPoints: [join(ROOT, 'src/hooks/pre-tool-use.ts')],
    outfile: join(ROOT, 'dist/hooks/pre-tool-use.js'),
    banner: {
      js: `#!/usr/bin/env node\n${nodeCommon.banner.js}`
    },
  });
  console.log('  ✓ dist/hooks/pre-tool-use.js');

  // 4. Hook PostToolUse
  await build({
    ...nodeCommon,
    entryPoints: [join(ROOT, 'src/hooks/post-tool-use.ts')],
    outfile: join(ROOT, 'dist/hooks/post-tool-use.js'),
    banner: {
      js: `#!/usr/bin/env node\n${nodeCommon.banner.js}`
    },
  });
  console.log('  ✓ dist/hooks/post-tool-use.js');

  // 5. UI React (bundle per browser)
  const uiDistDir = join(ROOT, 'dist/ui');
  if (!existsSync(uiDistDir)) mkdirSync(uiDistDir, { recursive: true });

  await build({
    entryPoints: [join(ROOT, 'src/ui/App.tsx')],
    outfile: join(ROOT, 'dist/ui/app.js'),
    bundle: true,
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    sourcemap: false,
    minify: true,
    jsx: 'automatic',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });
  console.log('  ✓ dist/ui/app.js');

  // 6a. CSS vendor (diff2html + highlight.js) — bundlati offline
  if (existsSync(join(ROOT, 'src/ui/styles/vendor.css'))) {
    await build({
      entryPoints: [join(ROOT, 'src/ui/styles/vendor.css')],
      outfile: join(ROOT, 'dist/ui/vendor.css'),
      bundle: true,
      minify: true,
    });
    console.log('  ✓ dist/ui/vendor.css');
  }

  // 6b. CSS UI custom
  if (existsSync(join(ROOT, 'src/ui/styles/index.css'))) {
    await build({
      entryPoints: [join(ROOT, 'src/ui/styles/index.css')],
      outfile: join(ROOT, 'dist/ui/app.css'),
      bundle: true,
      minify: true,
    });
    console.log('  ✓ dist/ui/app.css');
  }

  // 7. Copia index.html nella dist
  const htmlSrc = join(ROOT, 'src/ui/index.html');
  if (existsSync(htmlSrc)) {
    cpSync(htmlSrc, join(ROOT, 'dist/ui/index.html'));
    console.log('  ✓ dist/ui/index.html');
  }

  console.log('\n✅ Build completata!');
}

buildAll().catch((err) => {
  console.error('❌ Build fallita:', err);
  process.exit(1);
});
