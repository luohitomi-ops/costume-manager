# Cloud Personal Instance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the app owner can view and edit her own costume/prop inventory from her phone, from anywhere, without her PC needing to be on — by deploying the existing local app to Vercel, backed by a Turso cloud database, behind a single shared password.

**Architecture:** A swappable data-layer adapter (`local` driver wraps `better-sqlite3` synchronously but returns Promises; `turso` driver wraps `@libsql/client`, genuinely async) lets the same route/model code run against either backend, selected via a `DB_DRIVER` env var. Every model function and route handler becomes `async`. The Express `app` object is split out of `server.js` into its own module so it can be reused both by the existing local dev server and by a new Vercel serverless function entry point (`api/index.js` + a catch-all `vercel.json` rewrite). A minimal password-gate middleware protects all routes behind a session cookie. One-time scripts create the Turso schema and migrate the owner's real existing data across — this is a real, one-time production data migration, not a toy.

**Tech Stack:** Node.js (ESM), Express 4, better-sqlite3 (local driver), `@libsql/client` (Turso driver), Vercel (serverless deployment).

## Global Constraints

- No user accounts, no password reset flow — single shared secret (`ACCESS_PASSWORD` env var), by design (per the approved design doc).
- No real-time or periodic sync between any local copy and the cloud copy — after the one-time migration, Turso is the single source of truth; the owner stops using `localhost:3000` for her own daily use once this ships (per the design doc — the local dev server remains only as a driver mode other projects depend on, not for her daily use).
- The `local` driver and its existing behavior (used by the friend-offline-package `.exe` from the prior plan) must not regress — `npm run dev` and the packaged exe both continue to work exactly as before.
- No test framework exists in this project — verification is manual: run real commands against the real (already-provisioned) Turso database and a real Vercel deployment, inspect real output. This matches the project's existing convention.
- Real credentials already exist and are verified working, stored in `C:\Users\USER\projects\costume-manager\.env.local` (gitignored, never committed): `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ACCESS_PASSWORD`. Tasks that need them read from this file — never hardcode a credential value into a committed file.
- Vercel CLI is already authenticated locally as `YOUR-VERCEL-ACCOUNT`. Deployment needs a **brand new** Vercel project (do not reuse `your-other-vercel-project`, an unrelated React/Vite app under the same account).
- **Path note (found during Task 3's execution):** this plan's `cd C:\Users\USER\projects\costume-manager` lines were written before execution moved into an isolated git worktree. Every such line means "the actual directory this task is executing in" — if you're running from a worktree (e.g. `.worktrees\cloud-personal-instance`), `cd` there instead, not to the literal main-repo path. Running a verification command against the wrong checkout would silently validate against old, unmodified code.

## Verified findings (read before starting)

Live spike-testing was done against real infrastructure before writing this plan (a throwaway scratch Express app deployed via `vercel dev`, and real read/write queries against the actual provisioned Turso database, both cleaned up afterward):

1. **A bare `export default app` from a Vercel serverless function is not enough to route arbitrary paths.** Without a rewrite rule, Vercel's file-based routing only maps `api/index.js` to the literal path `/api` (confirmed: a request to `/api/hello` 404'd even though the Express app itself defines that route). **Fix:** a `vercel.json` with a catch-all rewrite (`{"rewrites": [{"source": "/(.*)", "destination": "/api/index"}]}`) routes every incoming path to the one Express app, which then does its own internal routing exactly as it does today. Confirmed working end-to-end (GET JSON route, POST with a UTF-8/Chinese JSON body, and `express.static` all returned correct responses through this setup).

2. **`@libsql/client`'s `INSERT` result returns `lastInsertRowid` as a JavaScript `BigInt`, not a `Number`.** Confirmed via a live INSERT against the real Turso database: `insertResult.lastInsertRowid` is `1n` (`typeof` `bigint`). `better-sqlite3`'s equivalent (`info.lastInsertRowid`) is a plain `Number`. This matters because `JSON.stringify` (and therefore Express's `res.json()`) **throws** if any value being serialized is a raw `BigInt` — if this leaked into an API response un-converted, every `createCharacter`/`createItem`/`createCategory` call would crash the request. **Fix:** the `turso` driver's `run()` method must wrap the value in `Number(...)` before returning it, mirroring what the `local` driver already effectively returns. Confirmed (via the same live test) that ordinary row data — e.g. an `id` column read back via `SELECT` — comes back as a plain `Number`, not `BigInt`; only the `run()`-result metadata field needs this conversion, not every integer column read through `get`/`all`.

3. **`@libsql/client` supports the same `@paramName` named-parameter syntax already used throughout `src/models/*.js`** (e.g. `INSERT INTO items (...) VALUES (@character_id, @name, ...)` with an object arg). Confirmed via a live INSERT and SELECT using named params against the real database. **This means no existing SQL string needs to be rewritten** — the adapter only needs to pass positional arrays or param objects through to `client.execute({ sql, args })` unchanged from how they're already written for `better-sqlite3`.

4. **`@libsql/client` exposes `batch()`, `executeMultiple()`, and `transaction()`** (confirmed present on the client object). `src/models/category.js`'s `moveCategory` does two sequential `UPDATE` statements to swap two rows' `sort_order` — under the current synchronous `better-sqlite3` code this is effectively atomic (nothing else can run mid-function, since better-sqlite3 blocks the event loop), but once converted to `async`/`await`, two concurrent requests to reorder categories could in principle interleave between the two updates. This project is single-user and password-gated, so the real-world risk is negligible, but since `batch()` (atomic multi-statement execution) is available and cheap to use, Task 3 uses it for this one function rather than accepting the risk unexamined.

## Project background: current code being modified

Read these files as they exist before this plan (all in `C:\Users\USER\projects\costume-manager`) — the tasks below reference their exact current content:
- `src/db/connection.js` — currently exports a raw `better-sqlite3` `Database` instance as `db`, with packaging-aware native-module/data-dir/schema-path resolution from the prior "Friend Offline Package" plan (unrelated to this plan's data-layer work — that logic must be preserved for the `local` driver).
- `src/models/character.js`, `src/models/item.js`, `src/models/category.js` — all synchronous, call `db.prepare(sql).get/all/run(...)` directly.
- `src/routes/characters.js`, `src/routes/items.js`, `src/routes/categories.js`, `src/routes/export.js` — synchronous Express handlers; `items.js` and `categories.js` already have `try/catch` blocks calling `next(err)` on mutation routes (POST/PATCH/DELETE), but GET routes do not.
- `src/server.js` — defines the Express `app`, static serving, route mounting, `app.listen(...)`, and (from the prior plan) packaged-exe-only browser auto-open logic.

---

### Task 1: Data-layer adapter — local and turso drivers, verified standalone

**Files:**
- Create: `src/db/drivers/local.js`
- Create: `src/db/drivers/turso.js`

**Interfaces:**
- Produces: both files export a factory function returning an object with this shape, which every later task treats as the contract:
  ```js
  {
    async get(sql, params = []) { /* returns a single row object, or undefined */ },
    async all(sql, params = []) { /* returns an array of row objects */ },
    async run(sql, params = []) { /* returns { lastInsertRowid: Number, changes: Number } */ },
    async exec(sql) { /* runs a multi-statement SQL script, no return value — local driver only, used by connection.js's schema bootstrap */ },
    async batch(statements) { /* statements: Array<{ sql, params }>, runs all atomically, no return value */ },
  }
  ```
  `params` for both `get`/`all`/`run` may be either an array (positional `?` placeholders) or a plain object (named `@param` placeholders) — both drivers must accept either form, matching how the existing model code already calls `better-sqlite3`.
- Consumes: `local.js`'s factory takes an already-constructed `better-sqlite3` `Database` instance as its argument. `turso.js`'s factory takes an already-constructed `@libsql/client` client instance as its argument. Neither file constructs its own connection — that's Task 2's job.

- [ ] **Step 1: Add the `@libsql/client` dependency**

```bash
cd C:\Users\USER\projects\costume-manager
npm install --save @libsql/client
```

- [ ] **Step 2: Create `src/db/drivers/local.js`**

```js
export function createLocalDriver(sqliteDb) {
  return {
    async get(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      return Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
    },
    async all(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
    },
    async run(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      const info = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
      return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
    },
    async exec(sql) {
      sqliteDb.exec(sql);
    },
    async batch(statements) {
      const runAll = sqliteDb.transaction((stmts) => {
        for (const { sql, params = [] } of stmts) {
          const stmt = sqliteDb.prepare(sql);
          Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
        }
      });
      runAll(statements);
    },
  };
}
```

- [ ] **Step 3: Create `src/db/drivers/turso.js`**

```js
export function createTursoDriver(client) {
  return {
    async get(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return result.rows[0];
    },
    async all(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return result.rows;
    },
    async run(sql, params = []) {
      const result = await client.execute({ sql, args: params });
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: Number(result.rowsAffected),
      };
    },
    async exec(sql) {
      await client.executeMultiple(sql);
    },
    async batch(statements) {
      await client.batch(
        statements.map(({ sql, params = [] }) => ({ sql, args: params })),
        'write'
      );
    },
  };
}
```

- [ ] **Step 4: Verify both drivers standalone, against real connections, using a throwaway table**

Create a temporary verification script (delete it after running):

```bash
cat > /tmp/verify-drivers.mjs << 'SCRIPT'
import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';
import fs from 'node:fs';
import { createLocalDriver } from 'C:/Users/USER/projects/costume-manager/src/db/drivers/local.js';
import { createTursoDriver } from 'C:/Users/USER/projects/costume-manager/src/db/drivers/turso.js';

const env = fs.readFileSync('C:/Users/USER/projects/costume-manager/.env.local', 'utf8');
env.split('\n').filter(Boolean).forEach((line) => {
  const idx = line.indexOf('=');
  process.env[line.slice(0, idx)] = line.slice(idx + 1);
});

async function verify(name, driver) {
  await driver.exec('DROP TABLE IF EXISTS driver_verify; CREATE TABLE driver_verify (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, sort_order INTEGER)');
  const insertResult = await driver.run('INSERT INTO driver_verify (name, sort_order) VALUES (@name, @sort_order)', { name: 'a', sort_order: 1 });
  console.log(`[${name}] run() result:`, insertResult, 'lastInsertRowid is Number:', typeof insertResult.lastInsertRowid === 'number');
  const row = await driver.get('SELECT * FROM driver_verify WHERE id = ?', [insertResult.lastInsertRowid]);
  console.log(`[${name}] get() result:`, row);
  await driver.run('INSERT INTO driver_verify (name, sort_order) VALUES (?, ?)', ['b', 2]);
  const rows = await driver.all('SELECT * FROM driver_verify ORDER BY sort_order');
  console.log(`[${name}] all() result:`, rows);
  await driver.batch([
    { sql: 'UPDATE driver_verify SET sort_order = ? WHERE name = ?', params: [99, 'a'] },
    { sql: 'UPDATE driver_verify SET sort_order = ? WHERE name = ?', params: [1, 'b'] },
  ]);
  const afterBatch = await driver.all('SELECT name, sort_order FROM driver_verify ORDER BY sort_order');
  console.log(`[${name}] after batch():`, afterBatch);
  await driver.exec('DROP TABLE driver_verify');
  console.log(`[${name}] cleaned up`);
}

const sqliteDb = new Database('/tmp/verify-local.db');
await verify('local', createLocalDriver(sqliteDb));
sqliteDb.close();
fs.rmSync('/tmp/verify-local.db', { force: true });

const tursoClient = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
await verify('turso', createTursoDriver(tursoClient));
SCRIPT
node /tmp/verify-drivers.mjs
rm /tmp/verify-drivers.mjs
```

Expected: both `[local]` and `[turso]` sections print matching shapes — `run()` results with a numeric (not bigint-typed) `lastInsertRowid`, `get()`/`all()` returning the expected rows, and the `after batch()` output showing `a` and `b` swapped (`a` at `sort_order 99`, `b` at `sort_order 1`) for both drivers, proving the batch update was atomic and consistent between drivers. Confirm no error output, and confirm `driver_verify` no longer exists in the real Turso database afterward (the script's own cleanup step; you can double-check with a manual `SELECT name FROM sqlite_master WHERE name = 'driver_verify'` returning no rows if you want extra certainty, though the script's own DROP TABLE already handles this).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/db/drivers/local.js src/db/drivers/turso.js
git commit -m "Add local and turso data-layer drivers with a shared async interface"
```

---

### Task 2: Rewire `connection.js` to select a driver

**Files:**
- Modify: `src/db/connection.js` (full rewrite of the driver-selection/export logic; the packaging-aware native-module/data-dir/schema-path resolution from the prior plan is preserved, not removed)

**Interfaces:**
- Consumes: `createLocalDriver` from `src/db/drivers/local.js`, `createTursoDriver` from `src/db/drivers/turso.js` (Task 1).
- Produces: `db` (default export) — now the **driver object** (`{ get, all, run, exec, batch }`) instead of a raw `better-sqlite3` instance. Every model file's `import db from '../db/connection.js'` keeps working, but every call site that used `db.prepare(sql).get(...)` must change in Task 3 to `await db.get(sql, ...)` — this task does not touch the model files, only makes the new shape available.
- Selected via `process.env.DB_DRIVER` — `'turso'` selects the Turso driver; anything else (including unset) defaults to `'local'`, preserving current behavior with zero configuration needed for existing usage (`npm run dev`, the packaged exe).

- [ ] **Step 1: Read the current full file for exact context**

```bash
cat C:\Users\USER\projects\costume-manager\src\db\connection.js
```

(You already have this file's content from the "Project background" section above — re-read it now to confirm nothing has changed since this plan was written.)

- [ ] **Step 2: Replace the full file**

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createClient } from '@libsql/client';
import { createLocalDriver } from './drivers/local.js';
import { createTursoDriver } from './drivers/turso.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');

const driverName = process.env.DB_DRIVER === 'turso' ? 'turso' : 'local';

let db;

if (driverName === 'turso') {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  db = createTursoDriver(client);
} else {
  const Database = isPackaged
    ? require(path.join(baseDir, 'native_modules', 'better-sqlite3'))
    : require('better-sqlite3');

  const dataDir = path.join(baseDir, 'data');
  const dbPath = path.join(dataDir, 'costume-manager.db');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
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
```

- [ ] **Step 3: Verify local mode is unaffected**

```bash
cd C:\Users\USER\projects\costume-manager
npm run dev
```
Expected: starts exactly as before, `http://localhost:3000` shows your real existing characters. This confirms the default (`DB_DRIVER` unset) path still exercises the exact same local-driver logic as before this task. Stop the server (Ctrl+C).

- [ ] **Step 4: Verify turso mode connects (models aren't async yet, so this only proves the connection wiring — not full functionality)**

```bash
cd C:\Users\USER\projects\costume-manager
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').filter(Boolean).forEach((line) => {
  const idx = line.indexOf('=');
  process.env[line.slice(0, idx)] = line.slice(idx + 1);
});
process.env.DB_DRIVER = 'turso';
import('./src/db/connection.js').then(async (mod) => {
  const db = mod.default;
  console.log('driver methods:', Object.keys(db));
  const result = await db.get('SELECT 1 AS ok');
  console.log('turso query result:', result);
});
"
```
Expected: prints `driver methods: [ 'get', 'all', 'run', 'exec', 'batch' ]` and `turso query result: { ok: 1 }` — confirms `connection.js` correctly builds and exports the Turso driver when `DB_DRIVER=turso`, without needing model/route changes yet.

- [ ] **Step 5: Commit**

```bash
git add src/db/connection.js
git commit -m "Select local or turso driver in connection.js based on DB_DRIVER"
```

---

### Task 3: Convert models to async

**Files:**
- Modify: `src/models/character.js` (full rewrite)
- Modify: `src/models/item.js` (full rewrite)
- Modify: `src/models/category.js` (full rewrite)

**Interfaces:**
- Consumes: `db` from `src/db/connection.js` (Task 2) — now used as `await db.get(sql, params)` / `await db.all(sql, params)` / `await db.run(sql, params)` / `await db.batch(statements)`, never `db.prepare(...)`.
- Produces: every exported function from these three files becomes `async` and returns a `Promise`. Function names and parameter shapes are unchanged from the current synchronous versions — only the call signature at call sites changes (callers must now `await` them). `validateStatusFields` in `item.js` does not touch the database and stays synchronous (do not make it async — it doesn't need to be, and Task 4's route code should not `await` it).

- [ ] **Step 1: Replace `src/models/character.js`**

```js
import db from '../db/connection.js';

export async function createCharacter({ name }) {
  if (!name || !name.trim()) {
    const err = new Error('name is required');
    err.status = 400;
    throw err;
  }
  const info = await db.run('INSERT INTO characters (name) VALUES (?)', [name.trim()]);
  return getCharacterById(info.lastInsertRowid);
}

export async function listCharacters() {
  return db.all('SELECT * FROM characters ORDER BY name');
}

export async function getCharacterById(id) {
  return db.get('SELECT * FROM characters WHERE id = ?', [id]);
}
```

- [ ] **Step 2: Replace `src/models/item.js`**

```js
import db from '../db/connection.js';
import { categoryExists } from './category.js';

const STATUSES = ['unassigned', 'in_storage', 'lent_out'];

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * Enforces the status/location/borrower rules from data-model.md:
 * in_storage requires location and no borrower; lent_out requires borrower
 * and no location; unassigned requires neither. Does not touch the
 * database — stays synchronous, do not await calls to this function.
 */
export function validateStatusFields({ status, location, borrower }) {
  const s = status || 'unassigned';
  if (!STATUSES.includes(s)) {
    throw badRequest(`status must be one of: ${STATUSES.join(', ')}`);
  }
  if (s === 'in_storage') {
    if (!location) throw badRequest('location is required when status is in_storage');
    if (borrower) throw badRequest('borrower must be empty when status is in_storage');
  } else if (s === 'lent_out') {
    if (!borrower) throw badRequest('borrower is required when status is lent_out');
    if (location) throw badRequest('location must be empty when status is lent_out');
  } else {
    if (location) throw badRequest('location must be empty when status is unassigned');
    if (borrower) throw badRequest('borrower must be empty when status is unassigned');
  }
  return s;
}

export async function createItem(input) {
  const { character_id, name, category, photo_path = null, note = null } = input;

  if (!character_id) throw badRequest('character_id is required');
  if (!name || !name.trim()) throw badRequest('name is required');
  if (!(await categoryExists(category))) {
    throw badRequest('category does not exist');
  }

  const status = validateStatusFields(input);
  const location = status === 'in_storage' ? input.location : null;
  const borrower = status === 'lent_out' ? input.borrower : null;

  const info = await db.run(
    `INSERT INTO items (character_id, name, category, status, location, borrower, photo_path, note)
     VALUES (@character_id, @name, @category, @status, @location, @borrower, @photo_path, @note)`,
    {
      character_id,
      name: name.trim(),
      category,
      status,
      location,
      borrower,
      photo_path,
      note,
    }
  );
  return getItemById(info.lastInsertRowid);
}

export async function getItemById(id) {
  return db.get('SELECT * FROM items WHERE id = ?', [id]);
}

export async function searchItems({ q, category, character_id, status, include_inactive } = {}) {
  const clauses = [];
  const params = {};

  if (!include_inactive) {
    clauses.push('active = 1');
  }
  if (q) {
    clauses.push('name LIKE @q');
    params.q = `%${q}%`;
  }
  if (category) {
    clauses.push('category = @category');
    params.category = category;
  }
  if (character_id) {
    clauses.push('character_id = @character_id');
    params.character_id = character_id;
  }
  if (status) {
    clauses.push('status = @status');
    params.status = status;
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db.all(`SELECT * FROM items ${where} ORDER BY name`, params);
}

export async function listItemsForCharacter(characterId, { include_inactive } = {}) {
  return searchItems({ character_id: characterId, include_inactive });
}

export async function updateItem(id, patch) {
  const existing = await getItemById(id);
  if (!existing) return null;

  const merged = {
    status: patch.status ?? existing.status,
    location: patch.location !== undefined ? patch.location : existing.location,
    borrower: patch.borrower !== undefined ? patch.borrower : existing.borrower,
  };

  // If status changes without explicit location/borrower, clear the other field.
  if (patch.status && patch.status !== existing.status) {
    if (patch.location === undefined) merged.location = null;
    if (patch.borrower === undefined) merged.borrower = null;
  }

  const status = validateStatusFields(merged);
  const location = status === 'in_storage' ? merged.location : null;
  const borrower = status === 'lent_out' ? merged.borrower : null;

  const active = patch.active !== undefined ? (patch.active ? 1 : 0) : existing.active;
  const note = patch.note !== undefined ? patch.note : existing.note;
  const photo_path = patch.photo_path !== undefined ? patch.photo_path : existing.photo_path;

  await db.run(
    `UPDATE items
     SET status = @status, location = @location, borrower = @borrower,
         active = @active, note = @note, photo_path = @photo_path,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE id = @id`,
    { id, status, location, borrower, active, note, photo_path }
  );

  return getItemById(id);
}

export async function allItemsWithCharacters() {
  return db.all(`
    SELECT items.*, characters.name AS character_name
    FROM items
    JOIN characters ON characters.id = items.character_id
    ORDER BY characters.name, items.name
  `);
}

export { STATUSES };
```

- [ ] **Step 3: Replace `src/models/category.js`**

```js
import db from '../db/connection.js';

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function conflict(message) {
  const err = new Error(message);
  err.status = 409;
  return err;
}

export async function listCategories() {
  return db.all('SELECT * FROM categories ORDER BY sort_order');
}

export async function categoryExists(slug) {
  return !!(await db.get('SELECT 1 FROM categories WHERE slug = ?', [slug]));
}

export async function createCategory({ name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const trimmed = name.trim();
  const slug = `custom_${Date.now()}`;
  const maxRow = await db.get('SELECT MAX(sort_order) AS max_order FROM categories');
  const nextOrder = (maxRow.max_order ?? -1) + 1;
  await db.run(
    'INSERT INTO categories (slug, name, sort_order, is_builtin) VALUES (?, ?, ?, 0)',
    [slug, trimmed, nextOrder]
  );
  return db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
}

export async function renameCategory(slug, { name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const existing = await db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
  if (!existing) return null;
  await db.run('UPDATE categories SET name = ? WHERE slug = ?', [name.trim(), slug]);
  return db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
}

export async function moveCategory(slug, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw badRequest("direction must be 'up' or 'down'");
  }
  const current = await db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
  if (!current) return null;

  const neighbor = direction === 'up'
    ? await db.get('SELECT * FROM categories WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1', [current.sort_order])
    : await db.get('SELECT * FROM categories WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1', [current.sort_order]);

  if (!neighbor) return listCategories();

  // Atomic swap (see plan's "Verified findings" item 4) — two independent
  // UPDATEs would no longer be implicitly atomic once this file is async.
  await db.batch([
    { sql: 'UPDATE categories SET sort_order = ? WHERE slug = ?', params: [neighbor.sort_order, current.slug] },
    { sql: 'UPDATE categories SET sort_order = ? WHERE slug = ?', params: [current.sort_order, neighbor.slug] },
  ]);
  return listCategories();
}

export async function deleteCategory(slug) {
  const existing = await db.get('SELECT * FROM categories WHERE slug = ?', [slug]);
  if (!existing) return null;
  const { count } = await db.get('SELECT COUNT(*) AS count FROM items WHERE category = ?', [slug]);
  if (count > 0) {
    throw conflict(`還有 ${count} 件道具使用這個分類，無法刪除`);
  }
  await db.run('DELETE FROM categories WHERE slug = ?', [slug]);
  return true;
}
```

- [ ] **Step 4: Verify against real local data with a throwaway script**

```bash
cd C:\Users\USER\projects\costume-manager
node -e "
import('./src/models/character.js').then(async (charMod) => {
  const chars = await charMod.listCharacters();
  console.log('characters:', chars.length, chars.map(c => c.name));
});
"
```
Expected: prints your real 3 characters by name — confirms the async conversion reads real local data correctly with no behavior change. (Do not run any create/update/delete calls against your real local data in this verification step — read-only checks only, per this project's data-safety convention.)

- [ ] **Step 5: Verify `moveCategory`'s atomic swap against local data**

```bash
node -e "
import('./src/models/category.js').then(async (catMod) => {
  const before = await catMod.listCategories();
  console.log('before:', before.map(c => \`\${c.slug}:\${c.sort_order}\`));
  await catMod.moveCategory(before[1].slug, 'up');
  const after = await catMod.listCategories();
  console.log('after:', after.map(c => \`\${c.slug}:\${c.sort_order}\`));
  // restore original order
  await catMod.moveCategory(after[0].slug, 'down');
  const restored = await catMod.listCategories();
  console.log('restored:', restored.map(c => \`\${c.slug}:\${c.sort_order}\`));
});
"
```
Expected: `before` and `restored` match exactly (proving the move-up-then-move-down round-trips cleanly), and `after` shows the second and first categories swapped. This exercises real local data with a real mutation, but restores it immediately — acceptable since categories are reordered, not deleted or corrupted, and the script proves it returns to the original state.

- [ ] **Step 6: Commit**

```bash
git add src/models/character.js src/models/item.js src/models/category.js
git commit -m "Convert all model functions to async against the driver interface"
```

---

### Task 4: Convert routes to async with an error-handling wrapper

**Files:**
- Create: `src/middleware/asyncHandler.js`
- Modify: `src/routes/characters.js` (full rewrite)
- Modify: `src/routes/items.js` (full rewrite)
- Modify: `src/routes/categories.js` (full rewrite)
- Modify: `src/routes/export.js` (full rewrite)

**Interfaces:**
- Produces: `asyncHandler(fn)` — wraps an async Express route handler `(req, res, next) => Promise`, catching any rejection and passing it to `next(err)` so Express's existing `(err, req, res, next)` error-handler middleware (already present at the bottom of `items.js` and `categories.js`) keeps working unchanged.
- Consumes: the now-async model functions from Task 3.

- [ ] **Step 1: Create `src/middleware/asyncHandler.js`**

```js
export function asyncHandler(fn) {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

- [ ] **Step 2: Replace `src/routes/characters.js`**

```js
import { Router } from 'express';
import { createCharacter, listCharacters, getCharacterById } from '../models/character.js';
import { listItemsForCharacter } from '../models/item.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const character = await createCharacter(req.body || {});
  res.status(201).json(character);
}));

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listCharacters());
}));

router.get('/:id/items', asyncHandler(async (req, res) => {
  const character = await getCharacterById(req.params.id);
  if (!character) {
    return res.status(404).json({ error: 'character not found' });
  }
  const includeInactive = req.query.include_inactive === 'true';
  res.json(await listItemsForCharacter(req.params.id, { include_inactive: includeInactive }));
}));

export default router;
```

- [ ] **Step 3: Replace `src/routes/items.js`**

```js
import { Router } from 'express';
import { createItem, searchItems, updateItem, getItemById } from '../models/item.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.post('/', asyncHandler(async (req, res) => {
  const item = await createItem(req.body || {});
  res.status(201).json(item);
}));

router.get('/', asyncHandler(async (req, res) => {
  const { q, category, character_id, status, include_inactive } = req.query;
  res.json(
    await searchItems({
      q,
      category,
      character_id,
      status,
      include_inactive: include_inactive === 'true',
    })
  );
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const existing = await getItemById(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'item not found' });
  }
  const updated = await updateItem(req.params.id, req.body || {});
  res.json(updated);
}));

// Central error handler for validation errors thrown by the model layer.
router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
```

- [ ] **Step 4: Replace `src/routes/categories.js`**

```js
import { Router } from 'express';
import {
  listCategories,
  createCategory,
  renameCategory,
  moveCategory,
  deleteCategory,
} from '../models/category.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await listCategories());
}));

router.post('/', asyncHandler(async (req, res) => {
  const category = await createCategory(req.body || {});
  res.status(201).json(category);
}));

router.patch('/:slug', asyncHandler(async (req, res) => {
  const category = await renameCategory(req.params.slug, req.body || {});
  if (!category) return res.status(404).json({ error: 'category not found' });
  res.json(category);
}));

router.post('/:slug/move', asyncHandler(async (req, res) => {
  const { direction } = req.body || {};
  const categories = await moveCategory(req.params.slug, direction);
  if (!categories) return res.status(404).json({ error: 'category not found' });
  res.json(categories);
}));

router.delete('/:slug', asyncHandler(async (req, res) => {
  const result = await deleteCategory(req.params.slug);
  if (!result) return res.status(404).json({ error: 'category not found' });
  res.status(204).end();
}));

router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
```

- [ ] **Step 5: Replace `src/routes/export.js`**

```js
import { Router } from 'express';
import { listCharacters } from '../models/character.js';
import { allItemsWithCharacters } from '../models/item.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

const CSV_COLUMNS = [
  'id', 'character_id', 'character_name', 'name', 'category', 'status',
  'location', 'borrower', 'photo_path', 'note', 'active', 'created_at', 'updated_at',
];

function toCsv(items) {
  const rows = items.map((item) =>
    CSV_COLUMNS.map((col) => csvEscape(item[col])).join(',')
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get('/export', asyncHandler(async (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const items = await allItemsWithCharacters();

  if (format === 'csv') {
    res.type('text/csv').send(toCsv(items));
    return;
  }

  res.json({
    characters: await listCharacters(),
    items,
  });
}));

export default router;
```

- [ ] **Step 6: Verify every endpoint end-to-end against real local data**

```bash
cd C:\Users\USER\projects\costume-manager
npm run dev
```
In a separate terminal, with the dev server running:
```bash
curl -s http://localhost:3000/api/characters
curl -s http://localhost:3000/api/categories
curl -s "http://localhost:3000/api/items?character_id=10"
curl -s http://localhost:3000/api/export
```
Expected: all four return the same real data shapes as before this task (compare against what you saw earlier this session — 3 characters including `絕區零-維琳娜`). Then confirm the UI itself still works by opening `http://localhost:3000` in a browser and clicking through — this proves the full request path (routes → models → local driver) works end-to-end, not just isolated pieces.

Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 7: Commit**

```bash
git add src/middleware/asyncHandler.js src/routes/characters.js src/routes/items.js src/routes/categories.js src/routes/export.js
git commit -m "Convert all route handlers to async with a shared error-catching wrapper"
```

---

### Task 5: Password-gate middleware and login page

**Files:**
- Create: `src/middleware/auth.js`
- Create: `public/login.html`
- Modify: `src/app.js` (does not exist yet — created in this task; Task 8 later imports it. See Step 4 for why the app definition moves out of `server.js` now rather than in Task 8.)
- Modify: `src/server.js` (trimmed down to import from the new `src/app.js`)

**Interfaces:**
- Produces: `requireAuth` middleware (checks a signed cookie; if absent/invalid, responds `401` for API paths or serves `login.html` for browser navigation) and a `POST /login` route that checks `req.body.password === process.env.ACCESS_PASSWORD` and, if correct, sets a signed cookie.
- Consumes: `process.env.ACCESS_PASSWORD` (already in `.env.local`, read via `npm run dev`'s environment once Task 5's dev-mode env loading is verified — see Step 5).

- [ ] **Step 1: Add the `cookie-parser` dependency (for reading the signed session cookie)**

```bash
cd C:\Users\USER\projects\costume-manager
npm install --save cookie-parser
```

- [ ] **Step 2: Create `src/middleware/auth.js`**

```js
import crypto from 'node:crypto';

const COOKIE_NAME = 'cm_session';

function expectedToken() {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) {
    throw new Error('ACCESS_PASSWORD environment variable is not set');
  }
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function checkPassword(candidate) {
  return candidate === process.env.ACCESS_PASSWORD;
}

export function sessionCookieValue() {
  return expectedToken();
}

export function requireAuth(req, res, next) {
  // /style.css must also be exempt: login.html itself loads it via
  // <link rel="stylesheet">, and that request hits this middleware
  // before express.static — without this, the login page would load
  // with no styling for anyone who isn't already authenticated.
  if (req.path === '/login' || req.path === '/login.html' || req.path === '/style.css') {
    return next();
  }
  const token = req.cookies?.[COOKIE_NAME];
  if (token === expectedToken()) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.redirect('/login.html');
}

export { COOKIE_NAME };
```

(Rationale for hashing rather than storing the raw password in the cookie: the cookie value never contains the literal password, only a derived token — a minor hardening step with no added complexity, not full session-security engineering, appropriate for this project's single-user, password-only threat model.)

- [ ] **Step 3: Create `public/login.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant" data-theme="costume">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>服裝道具管家 — 登入</title>
<link rel="stylesheet" href="style.css">
</head>
<body class="bg-base-200 text-base-content font-sans m-0">
  <div class="min-h-screen flex items-center justify-center">
    <div class="card bg-base-100 shadow-xl p-8 w-full max-w-sm">
      <h1 class="text-xl font-bold mb-4">服裝道具管家</h1>
      <form id="login-form">
        <label class="label"><span class="label-text">密碼</span></label>
        <input type="password" id="password" class="input input-bordered w-full mb-4" autofocus>
        <button type="submit" class="btn btn-primary w-full">登入</button>
        <p id="error" class="text-error mt-2 hidden">密碼錯誤</p>
      </form>
    </div>
  </div>
  <script>
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        document.getElementById('error').classList.remove('hidden');
      }
    });
  </script>
</body>
</html>
```

- [ ] **Step 4: Extract the Express app into `src/app.js`, trim `src/server.js`**

This split is needed now (not deferred to the Vercel task) because both the login route and the auth middleware belong on the `app` object itself, and Task 8's Vercel entry point needs to import that same `app` object without triggering `app.listen()` — doing the split here means Task 5's own verification (Step 6 below) already proves the split works, rather than discovering a problem for the first time in Task 8.

Create `src/app.js`:

```js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import './db/connection.js';
import charactersRouter from './routes/characters.js';
import itemsRouter from './routes/items.js';
import exportRouter from './routes/export.js';
import categoriesRouter from './routes/categories.js';
import { requireAuth, checkPassword, sessionCookieValue, COOKIE_NAME } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

const app = express();
app.use(express.json());
app.use(cookieParser());

app.post('/login', (req, res) => {
  if (checkPassword(req.body?.password)) {
    res.cookie(COOKIE_NAME, sessionCookieValue(), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
    return res.status(200).json({ ok: true });
  }
  res.status(401).json({ error: 'wrong password' });
});

app.use(requireAuth);
app.use(express.static(path.join(baseDir, 'public')));

app.use('/api/characters', charactersRouter);
app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api', exportRouter);

export default app;
```

Replace `src/server.js` with:

```js
import { exec } from 'node:child_process';
import app from './app.js';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Costume Manager running at ${url}`);

  if (typeof process.pkg !== 'undefined') {
    exec(`start "" "${url}"`);
  }
});

export default app;
```

Note: `requireAuth` runs for every request except `/login` and `/login.html` — including static assets and API routes alike, per the design doc's "single shared secret ... checked ... on all routes." The `/login` and `/login.html` exemption in `requireAuth` (Step 2) is what lets the login page itself, and its own POST handler, load before authentication.

- [ ] **Step 5: Verify locally with a real password check**

Load the real credentials for this manual test:
```bash
cd C:\Users\USER\projects\costume-manager
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const lines = env.split('\n').filter(Boolean).map(l => { const i = l.indexOf('='); return \`\${l.slice(0,i)}=\${l.slice(i+1)}\`; });
fs.writeFileSync('/tmp/run-with-env.sh', 'export ' + lines.join('\nexport ') + '\nnode src/server.js\n');
"
bash -c "source /tmp/run-with-env.sh" &
sleep 2
```

With the server running (now with `ACCESS_PASSWORD` set in its environment):
```bash
echo "--- unauthenticated request should be blocked ---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/characters

echo "--- login page and its stylesheet must load WITHOUT auth, or the login page itself is unusable ---"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login.html
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/style.css

echo "--- wrong password should be rejected ---"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"password":"wrong"}'

echo "--- correct password should succeed and set a cookie ---"
curl -s -c /tmp/cm-cookie.txt -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/login -H "Content-Type: application/json" -d "{\"password\":\"$(node -e "console.log(require('fs').readFileSync('.env.local','utf8').match(/ACCESS_PASSWORD=(.+)/)[1])")\"}"

echo "--- authenticated request with the cookie should now succeed ---"
curl -s -b /tmp/cm-cookie.txt -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/characters
```

Expected output, in order: `401`, `200`, `200`, `401`, `200`, `200`. This proves the full gate: API blocked without a session, the login page and its stylesheet both load without auth (otherwise the login page would render unstyled and be unusable), wrong password rejected, correct password grants a session, and the session persists across a subsequent request.

Stop the server and clean up:
```bash
pkill -f "node src/server.js" 2>/dev/null || true
rm -f /tmp/run-with-env.sh /tmp/cm-cookie.txt
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/middleware/auth.js public/login.html src/app.js src/server.js
git commit -m "Add password-gate middleware, login page, and split app.js from server.js"
```

---

### Task 6: One-time Turso schema setup script

**Files:**
- Create: `scripts/setup-turso-schema.mjs`

**Interfaces:**
- Consumes: `src/db/schema.sql`, and the same `categories`/`items` table-shaping logic currently duplicated inline in `connection.js`'s `migrateCategoriesTable`/`migrateItemsCategoryCheckRemoval` (this script reimplements the *end-state* schema directly — it does not need to replay the migration history, since this is a brand-new database, not an upgrade of an existing one).
- Produces: a fully-shaped schema in the real Turso database (run once, by hand, not part of the app's normal boot).

- [ ] **Step 1: Create `scripts/setup-turso-schema.mjs`**

```js
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

console.log('Done. Turso schema ready.');
```

- [ ] **Step 2: Run it for real against the actual provisioned Turso database**

```bash
cd C:\Users\USER\projects\costume-manager
node scripts/setup-turso-schema.mjs
```
Expected: prints each step, ending with `Done. Turso schema ready.`

- [ ] **Step 3: Verify the schema landed correctly**

```bash
node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').filter(Boolean).forEach((line) => { const idx = line.indexOf('='); process.env[line.slice(0,idx)] = line.slice(idx+1); });
const { createClient } = require('@libsql/client');
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
(async () => {
  const tables = await client.execute(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\");
  console.log('tables:', tables.rows.map(r => r.name));
  const cats = await client.execute('SELECT slug, name, sort_order FROM categories ORDER BY sort_order');
  console.log('categories:', cats.rows);
  const charCount = await client.execute('SELECT COUNT(*) AS n FROM characters');
  const itemCount = await client.execute('SELECT COUNT(*) AS n FROM items');
  console.log('characters:', charCount.rows[0].n, '| items:', itemCount.rows[0].n, '(both should be 0 — migration is Task 7)');
})();
"
```
Expected: `tables` includes `characters`, `items`, `categories` (and SQLite's own internal tables); `categories` shows the 6 built-ins in order; both counts are `0` (this task only creates structure — Task 7 migrates the real rows).

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-turso-schema.mjs
git commit -m "Add one-time Turso schema setup script"
```

(This script is safe to leave in the repo and safe to re-run — every `CREATE TABLE` uses `IF NOT EXISTS` and the category seed step checks for existing rows first, so re-running it against an already-set-up database is a no-op, not a duplicate-data risk.)

---

### Task 7: One-time data migration to Turso

**Files:**
- Create: `scripts/migrate-to-turso.mjs`

**Interfaces:**
- Consumes: the real local `data/costume-manager.db` (via `better-sqlite3` directly — this script intentionally does not go through the app's driver abstraction, since it needs to read from one specific database and write to another specific one simultaneously, not "whichever driver is currently selected") and the Turso database (schema already set up by Task 6).
- Produces: every row from the local `characters`, `categories`, and `items` tables copied into Turso, preserving primary key IDs (so item→character foreign keys stay valid) and preserving each row's real `created_at`/`updated_at` timestamps rather than generating new ones.

- [ ] **Step 1: Create `scripts/migrate-to-turso.mjs`**

```js
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
```

- [ ] **Step 2: Run it for real against your actual production data**

```bash
cd C:\Users\USER\projects\costume-manager
node scripts/migrate-to-turso.mjs
```
Expected: prints migration counts. Given the real local data confirmed multiple times earlier in this project (3 characters, 1 item, 6 built-in categories with 0 custom ones), expect approximately `Migrated 0 custom categories.` / `Migrated 3 characters.` / `Migrated 1 items.` — if the actual counts differ, that's fine (data may have changed since), but note what you see for the next verification step.

- [ ] **Step 3: Verify row counts and spot-check content match between local and Turso**

```bash
node -e "
const fs = require('fs');
const Database = require('better-sqlite3');
const { createClient } = require('@libsql/client');
const env = fs.readFileSync('.env.local', 'utf8');
env.split('\n').filter(Boolean).forEach((line) => { const idx = line.indexOf('='); process.env[line.slice(0,idx)] = line.slice(idx+1); });

const local = new Database('data/costume-manager.db', { readonly: true });
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

(async () => {
  const localChars = local.prepare('SELECT id, name FROM characters ORDER BY id').all();
  const tursoChars = (await client.execute('SELECT id, name FROM characters ORDER BY id')).rows;
  console.log('local characters:', JSON.stringify(localChars));
  console.log('turso characters:', JSON.stringify(tursoChars));
  console.log('MATCH:', JSON.stringify(localChars) === JSON.stringify(tursoChars.map(r => ({id: r.id, name: r.name}))));

  const localItemCount = local.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  const tursoItemCount = (await client.execute('SELECT COUNT(*) AS n FROM items')).rows[0].n;
  console.log('item counts — local:', localItemCount, '| turso:', tursoItemCount, '| MATCH:', localItemCount === tursoItemCount);
})();
"
```
Expected: `MATCH: true` for both checks. If either is `false`, stop and investigate before proceeding — do not continue to Task 8 with unverified migrated data.

- [ ] **Step 4: Commit**

```bash
git add scripts/migrate-to-turso.mjs
git commit -m "Add one-time data migration script from local SQLite to Turso"
```

(Like Task 6's script, this is safe to leave in the repo — it refuses to run a second time against a non-empty Turso `characters` table, so it can't accidentally double-migrate or overwrite.)

---

### Task 8: Vercel serverless deployment

**Files:**
- Create: `api/index.js`
- Create: `vercel.json`
- Modify: `.gitignore` (add `.vercel/` — `vercel link` creates a local `.vercel/project.json` with machine-specific project/org IDs that shouldn't be committed, same convention as the project owner's other Vercel-linked project)

**Interfaces:**
- Consumes: `app` (default export) from `src/app.js` (Task 5).
- Produces: a live Vercel deployment reachable at a real HTTPS URL, configured with `DB_DRIVER=turso`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ACCESS_PASSWORD` as Vercel environment variables (never committed to git).

- [ ] **Step 1: Add `.vercel/` to `.gitignore`**

Current `.gitignore` (from the prior "Friend Offline Package" plan):
```
node_modules/
data/
*.log
.env*
.DS_Store
Thumbs.db
.dev-tools/*.png
.superpowers/
.worktrees/
dist/
build/
```

Add a `.vercel/` line:
```
node_modules/
data/
*.log
.env*
.DS_Store
Thumbs.db
.dev-tools/*.png
.superpowers/
.worktrees/
dist/
build/
.vercel/
```

- [ ] **Step 2: Create `api/index.js`**

```js
export { default } from '../src/app.js';
```

- [ ] **Step 3: Create `vercel.json`**

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/api/index" }
  ]
}
```

(Confirmed necessary and sufficient by this plan's own spike test — see "Verified findings" item 1.)

- [ ] **Step 4: Create a brand new Vercel project (do not link to `your-other-vercel-project`)**

```bash
cd C:\Users\USER\projects\costume-manager
npx vercel link --yes
```
This was verified during this plan's spike test: `vercel link --yes` with no existing `.vercel` link and no `--project` flag auto-creates a new project named after the current directory (confirmed against a scratch folder, which produced a project named after that folder — running it from `costume-manager` will produce a project named `costume-manager`). Expected: creates and links a new project named `costume-manager` under the `YOUR-VERCEL-ACCOUNT` account (or `your-vercel-team`, matching the team namespace already seen when authenticated). Confirm with:
```bash
npx vercel project ls
```
Expected: `costume-manager` now appears in the list, separate from `your-other-vercel-project` and the other existing projects.

- [ ] **Step 5: Set the four required environment variables on the Vercel project**

Each of these prompts for a value on stdin — read the exact value from `.env.local` and paste it in when prompted (do not type it as a shell argument, which could leak it into shell history):

```bash
node -e "console.log(require('fs').readFileSync('.env.local','utf8'))"
```
(Prints all four values so you can copy each one for the prompts below — this output stays in your own terminal, not committed anywhere.)

```bash
npx vercel env add DB_DRIVER production
```
When prompted for the value, type: `turso`

```bash
npx vercel env add TURSO_DATABASE_URL production
```
Paste the `TURSO_DATABASE_URL` value from the printed `.env.local` content above.

```bash
npx vercel env add TURSO_AUTH_TOKEN production
```
Paste the `TURSO_AUTH_TOKEN` value.

```bash
npx vercel env add ACCESS_PASSWORD production
```
Paste the `ACCESS_PASSWORD` value.

Verify all four are set:
```bash
npx vercel env ls production
```
Expected: `DB_DRIVER`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ACCESS_PASSWORD` all listed (values themselves are not shown by `env ls`, only names — that's expected and fine).

- [ ] **Step 6: Deploy to production**

**This is a publish action — confirm with the project owner before running it, even though the design doc already approved building this project; the actual "go live" moment deserves an explicit go-ahead in the moment, the same way Project 4's actual `git push` was called out for separate confirmation in the design doc.**

Once confirmed:
```bash
npx vercel --prod
```
Expected: outputs a production URL (something like `https://costume-manager-xxxx.vercel.app` or `https://costume-manager.vercel.app`). Note the exact URL for Task 9.

- [ ] **Step 7: Smoke-test the live deployment**

```bash
DEPLOY_URL="<paste the URL from Step 5>"
echo "--- unauthenticated request should be blocked ---"
curl -s -o /dev/null -w "%{http_code}\n" "$DEPLOY_URL/api/characters"

echo "--- login with the real password should succeed ---"
curl -s -c /tmp/cm-prod-cookie.txt -o /dev/null -w "%{http_code}\n" -X POST "$DEPLOY_URL/login" -H "Content-Type: application/json" -d "{\"password\":\"$(node -e "console.log(require('fs').readFileSync('.env.local','utf8').match(/ACCESS_PASSWORD=(.+)/)[1])")\"}"

echo "--- authenticated request should now return the real migrated data ---"
curl -s -b /tmp/cm-prod-cookie.txt "$DEPLOY_URL/api/characters"
```
Expected: `401`, `200`, then a JSON array containing the real migrated characters (matching what Task 7 confirmed was in Turso). This is the first point in this plan where the live cloud deployment, real Turso data, and the password gate are all proven working together.

Clean up:
```bash
rm -f /tmp/cm-prod-cookie.txt
```

- [ ] **Step 8: Commit**

```bash
git add api/index.js vercel.json .gitignore
git commit -m "Add Vercel serverless entry point and deployment config"
```

---

### Task 9: End-to-end verification and local/cloud mode confirmation

This task has no code changes — it confirms the finished system behaves as the design doc intends: the owner can use the cloud instance from any device, and the local `npm run dev` / packaged-exe paths (used by this project and the prior Friend Offline Package project) remain unaffected.

**Files:** none (verification only)

- [ ] **Step 1: Full functional pass against the live Vercel URL**

Using a real browser (not curl), navigate to the deployed URL from Task 8. Confirm:
1. Without a session, the login page appears (not the app UI, not a raw 401 JSON blob for a browser navigation).
2. Entering the wrong password shows an error and does not proceed.
3. Entering the real password (from `.env.local`) logs in and shows the real migrated inventory (the same characters/items confirmed in Task 7).
4. Register one new test character and one test item through the live UI. Confirm it appears immediately.
5. Reload the page. Confirm the session persists (still logged in, no need to re-enter the password) and the new test character/item are still there (proves the write actually landed in Turso, not just an in-memory response).

- [ ] **Step 2: Clean up the test data created in Step 1**

Through the live UI itself (not a script), delete or deactivate the test character/item created in Step 1, so the cloud instance's real data stays clean going forward. If deletion isn't straightforward through the UI for characters (only items have an `active` soft-delete per the current schema), leaving a single harmless test character named something like "測試角色" is acceptable — note this to the project owner rather than writing an ad-hoc deletion script against production data.

- [ ] **Step 3: Confirm the local dev server is unaffected**

```bash
cd C:\Users\USER\projects\costume-manager
npm run dev
```
Expected: starts normally (no `DB_DRIVER` set in this shell, so it defaults to `local`), serves your real local data unchanged. Open `http://localhost:3000` and confirm the login page does **not** appear here — `requireAuth`'s cookie check still applies locally too (per the design's "single password on all routes," this isn't cloud-only), so log in once with the real password to confirm local mode's auth also works, matching Task 5's earlier verification. Stop the server once confirmed (Ctrl+C).

- [ ] **Step 4: Confirm the packaged friend-offline exe still builds and runs (regression check against the prior plan's work)**

```bash
npm run build:exe
```
Expected: completes successfully exactly as before (this plan's changes to `src/app.js`/`src/server.js` must not have broken the packaging pipeline from the prior plan — the packaged exe still uses the `local` driver by default, since `DB_DRIVER` is never set in the friend's environment). If you want to go further, repeat the friend-machine simulation from the prior plan's Task 5 (build, copy to an isolated `/tmp` folder, run, confirm blank slate) — optional here since Task 8/9 of *that* plan already proved this pipeline works before this plan's changes; this step's purpose is only to catch a regression, not to re-prove the whole thing from scratch.

- [ ] **Step 5: Final report — no commit needed unless a regression was found and fixed**

If Steps 1-4 all passed without needing any code changes, there is nothing to commit. If a regression was found and fixed, commit that fix with a message describing what Task 9's verification caught.
