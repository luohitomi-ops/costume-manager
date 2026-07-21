import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createLocalDriver } from './drivers/local.js';
import { createTursoDriver } from './drivers/turso.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');

const driverName = process.env.DB_DRIVER === 'turso' ? 'turso' : 'local';

let db;

if (driverName === 'turso') {
  // Loaded lazily (never at the top of the file) so the packaged/local-only
  // build never touches this at all — @libsql/client's own module-load-time
  // code pulls in a platform-specific native binary that pkg's snapshot
  // can't embed, which crashed every packaged build with "Cannot find
  // module '@libsql/win32-x64-msvc'" even though the exe never uses it.
  const { createClient } = require('@libsql/client');
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  db = createTursoDriver(client);
} else {
  const Database = isPackaged
    ? require(path.join(baseDir, 'native_modules', 'better-sqlite3'))
    : require('better-sqlite3');

  // Packaged builds store data outside the exe's own folder (in the OS's
  // per-user app data directory) so re-extracting a new zip version — even
  // to a different folder, or after deleting the old one — never loses
  // data. Dev/source mode keeps the old project-relative location, which is
  // the expected, discoverable place for a self-hoster running from source.
  const dataDir = isPackaged
    ? path.join(process.env.APPDATA || baseDir, 'costume-manager', 'data')
    : path.join(baseDir, 'data');
  const dbPath = path.join(dataDir, 'costume-manager.db');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // One-time migration for installs from before this change: if the old
  // exe-folder-relative db exists and nothing has been written to the new
  // location yet, move it over so upgrading never silently drops data.
  if (isPackaged && !fs.existsSync(dbPath)) {
    const oldDbPath = path.join(baseDir, 'data', 'costume-manager.db');
    if (fs.existsSync(oldDbPath)) {
      fs.copyFileSync(oldDbPath, dbPath);
      for (const suffix of ['-wal', '-shm']) {
        if (fs.existsSync(oldDbPath + suffix)) fs.copyFileSync(oldDbPath + suffix, dbPath + suffix);
      }
    }
  }

  const sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');

  const schemaPath = isPackaged ? path.join(baseDir, 'db', 'schema.sql') : path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  sqliteDb.exec(schema);

  migrateCategoriesTable(sqliteDb);
  migrateItemsCategoryCheckRemoval(sqliteDb);

  db = createLocalDriver(sqliteDb);
}

/**
 * Categories used to be a fixed hardcoded list; this creates the real
 * `categories` table and seeds the original 6 built-in categories the
 * first time it runs. Deliberately NOT part of schema.sql's CREATE TABLE
 * IF NOT EXISTS — that would create an empty table with no seed rows on a
 * brand-new database, and this function's "does the table exist" check
 * would then skip seeding forever. This is the single source of truth for
 * both fresh installs and upgrades. Local driver only — a fresh Turso
 * database is set up once via scripts/setup-turso-schema.mjs (Task 6),
 * not on every boot.
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
 * drop the constraint entirely. Local driver only, same reasoning as above.
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
