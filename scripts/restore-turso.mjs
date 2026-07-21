import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { createTursoDriver } from '../src/db/drivers/turso.js';
import { restoreAllTables } from './lib/backup-restore-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const args = process.argv.slice(2);
const confirmed = args.includes('--confirm');
const filenameArg = args.find((a) => !a.startsWith('--'));

const backupsDir = path.join(root, 'backups');
let backupPath;
if (filenameArg) {
  backupPath = path.isAbsolute(filenameArg) ? filenameArg : path.join(backupsDir, filenameArg);
} else {
  const latest = fs
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith('costume-manager-') && f.endsWith('.json'))
    .sort()
    .at(-1);
  if (!latest) {
    console.error(`No backup files found in ${backupsDir}.`);
    process.exit(1);
  }
  backupPath = path.join(backupsDir, latest);
}

console.log(`Reading backup: ${backupPath}`);
const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
console.log(`  exported_at: ${backup.exported_at}`);
console.log(
  `  categories: ${backup.categories.length}, characters: ${backup.characters.length}, ` +
  `items: ${backup.items.length}, lenses: ${backup.lenses.length}`
);

if (!confirmed) {
  console.log('');
  console.log('Dry run only — nothing was written to Turso.');
  console.log('This will INSERT OR REPLACE every row above into the live Turso database');
  console.log('(existing rows with the same id/slug get overwritten with the backup\'s version).');
  console.log('Re-run with --confirm to actually restore:');
  console.log(`  node scripts/restore-turso.mjs ${filenameArg || path.basename(backupPath)} --confirm`);
  process.exit(0);
}

const envPath = path.join(root, '.env.local');
const env = fs.readFileSync(envPath, 'utf-8');
env.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
  const idx = line.indexOf('=');
  process.env[line.slice(0, idx)] = line.slice(idx + 1);
});

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const driver = createTursoDriver(client);

await restoreAllTables(driver, backup);
console.log('Restore complete.');
