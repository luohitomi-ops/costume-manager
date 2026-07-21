import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';
import { createTursoDriver } from '../src/db/drivers/turso.js';
import { exportAllTables } from './lib/backup-restore-core.mjs';

const KEEP_LATEST = 20;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

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

const backup = await exportAllTables(driver);

const backupsDir = path.join(root, 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const stamp = backup.exported_at.replace(/:/g, '-').replace(/\..+/, '');
const outPath = path.join(backupsDir, `costume-manager-${stamp}.json`);
fs.writeFileSync(outPath, JSON.stringify(backup, null, 2), 'utf-8');

console.log(`Backed up to ${outPath}`);
console.log(
  `  categories: ${backup.categories.length}, characters: ${backup.characters.length}, ` +
  `items: ${backup.items.length}, lenses: ${backup.lenses.length}`
);

const existing = fs
  .readdirSync(backupsDir)
  .filter((f) => f.startsWith('costume-manager-') && f.endsWith('.json'))
  .sort();
const toDelete = existing.slice(0, Math.max(0, existing.length - KEEP_LATEST));
for (const f of toDelete) {
  fs.unlinkSync(path.join(backupsDir, f));
}
if (toDelete.length > 0) {
  console.log(`Pruned ${toDelete.length} old backup(s), keeping the latest ${KEEP_LATEST}.`);
}
