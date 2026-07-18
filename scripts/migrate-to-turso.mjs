import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const envPath = path.join(root, '.env.local');
const env = fs.readFileSync(envPath, 'utf-8');
env.split('\n').filter(Boolean).forEach((line) => {
  const idx = line.indexOf('=');
  process.env[line.slice(0, idx)] = line.slice(idx + 1);
});

const localDbPath = path.join(root, 'data', 'costume-manager.db');
console.log(`Reading local database: ${localDbPath}`);
const local = new Database(localDbPath, { readonly: true });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const existingChars = await client.execute('SELECT COUNT(*) AS n FROM characters');
if (existingChars.rows[0].n > 0) {
  console.error(
    `Turso already has ${existingChars.rows[0].n} character row(s). Refusing to run — this script is meant for a one-time migration into an empty database. If you intended to re-run this, clear the Turso tables manually first.`
  );
  process.exit(1);
}

console.log('Migrating categories (skipping the 6 already-seeded built-ins, migrating only custom ones)...');
const localCategories = local.prepare('SELECT * FROM categories WHERE is_builtin = 0 ORDER BY sort_order').all();
for (const cat of localCategories) {
  await client.execute({
    sql: 'INSERT INTO categories (slug, name, sort_order, is_builtin) VALUES (@slug, @name, @sort_order, @is_builtin)',
    args: cat,
  });
}
console.log(`Migrated ${localCategories.length} custom categories.`);

console.log('Migrating characters...');
const localCharacters = local.prepare('SELECT * FROM characters ORDER BY id').all();
for (const char of localCharacters) {
  await client.execute({
    sql: 'INSERT INTO characters (id, name, created_at) VALUES (@id, @name, @created_at)',
    args: char,
  });
}
console.log(`Migrated ${localCharacters.length} characters.`);

console.log('Migrating items...');
const localItems = local.prepare('SELECT * FROM items ORDER BY id').all();
for (const item of localItems) {
  await client.execute({
    sql: `INSERT INTO items
      (id, character_id, name, category, status, location, borrower, photo_path, note, active, created_at, updated_at)
      VALUES
      (@id, @character_id, @name, @category, @status, @location, @borrower, @photo_path, @note, @active, @created_at, @updated_at)`,
    args: item,
  });
}
console.log(`Migrated ${localItems.length} items.`);

local.close();
console.log('Done. Verify row counts with scripts output above against your known real data before trusting the cloud copy.');
