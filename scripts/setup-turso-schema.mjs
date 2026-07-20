import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@libsql/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const envPath = path.join(root, '.env.local');
const env = fs.readFileSync(envPath, 'utf-8');
env.split('\n').filter(Boolean).forEach((line) => {
  const idx = line.indexOf('=');
  process.env[line.slice(0, idx)] = line.slice(idx + 1);
});

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log('Creating characters table...');
await client.execute(`
  CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);

console.log('Creating items table (final shape, no CHECK on category)...');
await client.execute(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    character_id INTEGER NOT NULL REFERENCES characters(id),
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'in_storage', 'lent_out')),
    location TEXT,
    borrower TEXT,
    photo_path TEXT,
    note TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
await client.execute('CREATE INDEX IF NOT EXISTS idx_items_character_id ON items(character_id)');
await client.execute('CREATE INDEX IF NOT EXISTS idx_items_name ON items(name)');
await client.execute('CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)');

console.log('Creating categories table...');
await client.execute(`
  CREATE TABLE IF NOT EXISTS categories (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_builtin INTEGER NOT NULL DEFAULT 0
  )
`);

const existing = await client.execute('SELECT COUNT(*) AS n FROM categories');
if (existing.rows[0].n === 0) {
  console.log('Seeding built-in categories...');
  const builtins = [
    ['costume', '服裝'],
    ['wig', '假髮'],
    ['shoes', '鞋子'],
    ['prop', '道具'],
    ['lens', '隱眼'],
    ['other', '其他'],
  ];
  let order = 0;
  for (const [slug, name] of builtins) {
    await client.execute({
      sql: 'INSERT INTO categories (slug, name, sort_order, is_builtin) VALUES (?, ?, ?, 1)',
      args: [slug, name, order],
    });
    order += 1;
  }
} else {
  console.log(`Categories table already has ${existing.rows[0].n} rows — skipping seed (already set up).`);
}

console.log('Creating lenses table...');
await client.execute(`
  CREATE TABLE IF NOT EXISTS lenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )
`);
await client.execute('CREATE INDEX IF NOT EXISTS idx_lenses_name ON lenses(name)');

console.log('Done. Turso schema ready.');
