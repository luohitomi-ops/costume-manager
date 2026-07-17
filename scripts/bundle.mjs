import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('build', { recursive: true });
copyFileSync('src/db/schema.sql', 'build/schema.sql');

await build({
  entryPoints: ['src/server.js'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'build/bundle.cjs',
  external: ['better-sqlite3'],
  // The source uses ESM's `fileURLToPath(import.meta.url)` to derive
  // __dirname. esbuild's cjs output format empties `import.meta` (it
  // has no CJS equivalent), which made every such call crash at
  // startup with "TypeError: path argument must be of type string".
  // Since bundling merges everything into this single output file,
  // the plain CJS `__filename` the banner captures below is exactly
  // equivalent to what `import.meta.url` would have resolved to per
  // module — so redirect all `import.meta.url` reads to it.
  define: {
    'import.meta.url': 'import_meta_url_shim',
  },
  banner: {
    js: "const import_meta_url_shim = require('node:url').pathToFileURL(__filename).href;",
  },
});

console.log('Bundled to build/bundle.cjs');
