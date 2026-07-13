import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = path.join(dataDir, 'costume-manager.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

migrateCategoriesTable(db);
migrateItemsCategoryCheckRemoval(db);

/**
 * Categories used to be a fixed hardcoded list; this creates the real
 * `categories` table and seeds the original 6 built-in categories the
 * first time it runs. Deliberately NOT part of schema.sql's CREATE TABLE
 * IF NOT EXISTS — that would create an empty table with no seed rows on a
 * brand-new database, and this function's "does the table exist" check
 * would then skip seeding forever. This is the single source of truth for
 * both fresh installs and upgrades.
 */
function migrateCategoriesTable(database) {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'categories'")
    .get();
  if (row) return;

  database.exec(`
    CREATE TABLE categories (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 0
    );
  `);

  const seed = database.prepare(
    'INSERT INTO categories (slug, name, sort_order, is_builtin) VALUES (?, ?, ?, 1)'
  );
  const builtins = [
    ['costume', '服裝'],
    ['wig', '假髮'],
    ['shoes', '鞋子'],
    ['prop', '道具'],
    ['lens', '隱眼'],
    ['other', '其他'],
  ];
  builtins.forEach(([slug, name], index) => seed.run(slug, name, index));
}

/**
 * Categories are now user-managed data (see migrateCategoriesTable above),
 * so items.category can no longer be a fixed CHECK-constrained enum.
 * SQLite can't ALTER a CHECK constraint in place, so this rebuilds the
 * items table once (same rebuild-and-copy technique used previously) to
 * drop the constraint entirely. Supersedes the old lens/other-widening
 * migration from the previous feature — this one removes the CHECK clause
 * altogether rather than widening its list.
 */
function migrateItemsCategoryCheckRemoval(database) {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'")
    .get();
  if (!row || !row.sql.includes('CHECK (category')) return;

  database.exec(`
    BEGIN TRANSACTION;
    ALTER TABLE items RENAME TO items_old;
    CREATE TABLE items (
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
    );
    INSERT INTO items SELECT * FROM items_old;
    DROP TABLE items_old;
    CREATE INDEX IF NOT EXISTS idx_items_character_id ON items(character_id);
    CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
    CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
    COMMIT;
  `);
}

export default db;
