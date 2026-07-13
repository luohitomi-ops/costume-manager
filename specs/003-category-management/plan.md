# 分類管理（設置頁面）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把分類從寫死在程式碼裡的清單變成真正的資料，新增一個「設置」頁面
（`public/settings.html`）可以新增/改名/刪除/調整順序分類，`index.html`/`wardrobe.html`
兩處原本寫死的分類下拉選單改成動態讀取同一份資料。

**Architecture:** 新增 `categories` 資料表 + `src/models/category.js` + `src/routes/
categories.js` 五個 REST endpoint。前端三個頁面（`index.html`/`wardrobe.html`/新的
`settings.html`）都在頁面載入時打 `GET /api/categories`，共用 `public/shared.js` 裡的
`itemToLine`/圖示查找函式。純 vanilla JS，無框架，跟現有兩個頁面同一套模式。

**Tech Stack:** Express 4、better-sqlite3、Tailwind CSS v4 + DaisyUI v5（本地 build）、
Playwright（`.dev-tools/shot.mjs`，開發期截圖驗證用）。

## Global Constraints

- 這個專案的真實資料庫（`data/costume-manager.db`）已經有真實角色/道具資料，任何
  schema 改動都要走「重建表格搬資料」的安全遷移手法（`src/db/connection.js` 已有
  先例），不能直接 `ALTER`/砍表；不要塞測試資料進真實資料庫。
- 改完 `public/*.html` 的 class 後一定要 `npm run build:css`。
- 不新增測試框架；用 curl + Playwright 截圖驗證，不寫 `node --test` 測試檔。
- 原本 6 個內建分類（服裝/假髮/鞋子/道具/隱眼/其他）跟自訂分類管理權限完全平等
  （都能改名/刪除/調順序），不特別保護內建分類。
- 刪除分類時，只要 `items` 表還有任何一筆（不分 `active` 欄位)引用該 slug 就要擋掉，
  回 409，訊息格式：`還有 ${count} 件道具使用這個分類，無法刪除`。
- 排序用上/下箭頭按鈕，不做拖曳（這個專案沒有引入任何額外前端套件，維持一貫的極簡
  vanilla JS 風格）。
- 顏色/字體/卡片圓角等視覺 token 一律沿用 `specs/001-costume-item-tracking/
  design-spec.md` 既有數值。
- 這個專案目前在 git branch 上工作（沒有 worktree），這輪工作建議另開一個新 feature
  分支（例如 `feature/category-management`），流程比照上一輪穿衣櫃功能。

---

## Task 1: 後端 — categories 資料表 + model + routes + 遷移

**Files:**
- Modify: `src/db/schema.sql`
- Modify: `src/db/connection.js`
- Create: `src/models/category.js`
- Modify: `src/models/item.js`
- Create: `src/routes/categories.js`
- Modify: `src/server.js`

**Interfaces:**
- Produces: `GET/POST/PATCH/DELETE /api/categories` 系列 endpoint（見下方 API 表）；
  `src/models/category.js` 匯出 `listCategories()`、`categoryExists(slug)`、
  `createCategory({name})`、`renameCategory(slug, {name})`、`moveCategory(slug,
  direction)`、`deleteCategory(slug)`，之後的任務（前端三頁）都會 fetch 這組 API，
  不會直接 import 這個檔案。

- [ ] **Step 1: 修改 `src/db/schema.sql`，拿掉 `items.category` 的 CHECK 限制**

把：
```sql
  category TEXT NOT NULL CHECK (category IN ('costume', 'wig', 'shoes', 'prop', 'lens', 'other')),
```
改成：
```sql
  category TEXT NOT NULL,
```
（`categories` 表不放進 `schema.sql`——它的建表+種子資料完全交給下面 Step 2 的遷移
函式處理，這樣「全新資料庫」跟「既有資料庫升級」都走同一條路徑，不會有「schema.sql
建了空表、遷移函式看到表已存在就跳過種子資料」這種不一致的坑。）

- [ ] **Step 2: 修改 `src/db/connection.js`，新增分類表遷移 + 拿掉 items 表 CHECK 的遷移**

把整個檔案內容改成：

```js
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
```

- [ ] **Step 3: 建立 `src/models/category.js`**

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

export function listCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order').all();
}

export function categoryExists(slug) {
  return !!db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug);
}

export function createCategory({ name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const trimmed = name.trim();
  const slug = `custom_${Date.now()}`;
  const maxRow = db.prepare('SELECT MAX(sort_order) AS max_order FROM categories').get();
  const nextOrder = (maxRow.max_order ?? -1) + 1;
  db.prepare('INSERT INTO categories (slug, name, sort_order, is_builtin) VALUES (?, ?, ?, 0)')
    .run(slug, trimmed, nextOrder);
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

export function renameCategory(slug, { name }) {
  if (!name || !name.trim()) throw badRequest('name is required');
  const existing = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!existing) return null;
  db.prepare('UPDATE categories SET name = ? WHERE slug = ?').run(name.trim(), slug);
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

export function moveCategory(slug, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw badRequest("direction must be 'up' or 'down'");
  }
  const current = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!current) return null;

  const neighbor = direction === 'up'
    ? db.prepare('SELECT * FROM categories WHERE sort_order < ? ORDER BY sort_order DESC LIMIT 1').get(current.sort_order)
    : db.prepare('SELECT * FROM categories WHERE sort_order > ? ORDER BY sort_order ASC LIMIT 1').get(current.sort_order);

  if (!neighbor) return listCategories();

  db.prepare('UPDATE categories SET sort_order = ? WHERE slug = ?').run(neighbor.sort_order, current.slug);
  db.prepare('UPDATE categories SET sort_order = ? WHERE slug = ?').run(current.sort_order, neighbor.slug);
  return listCategories();
}

export function deleteCategory(slug) {
  const existing = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!existing) return null;
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM items WHERE category = ?').get(slug);
  if (count > 0) {
    throw conflict(`還有 ${count} 件道具使用這個分類，無法刪除`);
  }
  db.prepare('DELETE FROM categories WHERE slug = ?').run(slug);
  return true;
}
```

- [ ] **Step 4: 修改 `src/models/item.js`，`createItem` 改用資料庫驗證分類**

把檔案開頭：
```js
import db from '../db/connection.js';

const CATEGORIES = ['costume', 'wig', 'shoes', 'prop', 'lens', 'other'];
const STATUSES = ['unassigned', 'in_storage', 'lent_out'];
```
改成：
```js
import db from '../db/connection.js';
import { categoryExists } from './category.js';

const STATUSES = ['unassigned', 'in_storage', 'lent_out'];
```

把 `createItem` 裡的：
```js
  if (!CATEGORIES.includes(category)) {
    throw badRequest(`category must be one of: ${CATEGORIES.join(', ')}`);
  }
```
改成：
```js
  if (!categoryExists(category)) {
    throw badRequest('category does not exist');
  }
```

檔案最後一行：
```js
export { CATEGORIES, STATUSES };
```
改成：
```js
export { STATUSES };
```

（`CATEGORIES` 沒有其他地方 import——確認方式：`grep -rn "CATEGORIES" src/ public/` 除了
`item.js` 自己以外不會有其他結果；如果你發現有其他地方 import 了 `CATEGORIES`，先停下來
回報，不要自己猜著改。)

- [ ] **Step 5: 建立 `src/routes/categories.js`**

```js
import { Router } from 'express';
import {
  listCategories,
  createCategory,
  renameCategory,
  moveCategory,
  deleteCategory,
} from '../models/category.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(listCategories());
});

router.post('/', (req, res, next) => {
  try {
    const category = createCategory(req.body || {});
    res.status(201).json(category);
  } catch (err) {
    next(err);
  }
});

router.patch('/:slug', (req, res, next) => {
  try {
    const category = renameCategory(req.params.slug, req.body || {});
    if (!category) return res.status(404).json({ error: 'category not found' });
    res.json(category);
  } catch (err) {
    next(err);
  }
});

router.post('/:slug/move', (req, res, next) => {
  try {
    const { direction } = req.body || {};
    const categories = moveCategory(req.params.slug, direction);
    if (!categories) return res.status(404).json({ error: 'category not found' });
    res.json(categories);
  } catch (err) {
    next(err);
  }
});

router.delete('/:slug', (req, res, next) => {
  try {
    const result = deleteCategory(req.params.slug);
    if (!result) return res.status(404).json({ error: 'category not found' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message });
});

export default router;
```

- [ ] **Step 6: 修改 `src/server.js`，掛上新 router**

把：
```js
import charactersRouter from './routes/characters.js';
import itemsRouter from './routes/items.js';
import exportRouter from './routes/export.js';
```
改成：
```js
import charactersRouter from './routes/characters.js';
import itemsRouter from './routes/items.js';
import exportRouter from './routes/export.js';
import categoriesRouter from './routes/categories.js';
```

把：
```js
app.use('/api/characters', charactersRouter);
app.use('/api/items', itemsRouter);
app.use('/api', exportRouter);
```
改成：
```js
app.use('/api/characters', charactersRouter);
app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api', exportRouter);
```

- [ ] **Step 7: 重啟伺服器並驗證遷移 + 全部 5 個 endpoint**

這個改動涉及 DB 遷移，執行中的 dev server 必須重啟才會套用（Node 不會自動重載)。
重啟後：

```bash
curl -s http://localhost:3000/api/categories
```
Expected: 回傳 6 筆內建分類，依序服裝→假髮→鞋子→道具→隱眼→其他，每筆有
`slug`/`name`/`sort_order`/`is_builtin`。

```bash
curl -s -X POST http://localhost:3000/api/categories -H "Content-Type: application/json" -d '{"name":"測試分類"}'
```
Expected: 201，回傳新分類，`is_builtin:0`，`sort_order` 是 6（排在最後)。記下回傳的
`slug`（例如 `custom_1720800000000`），下面步驟要用。

```bash
curl -s -X PATCH http://localhost:3000/api/categories/<剛剛的slug> -H "Content-Type: application/json" -d '{"name":"改名測試"}'
```
Expected: 200，`name` 變成「改名測試」，`slug` 不變。

```bash
curl -s -X POST http://localhost:3000/api/categories/<剛剛的slug>/move -H "Content-Type: application/json" -d '{"direction":"up"}'
```
Expected: 200，回傳全部分類列表，這筆的 `sort_order` 變小了（跟前一筆對調)。

```bash
curl -s -X DELETE http://localhost:3000/api/categories/<剛剛的slug>
```
Expected: 204 no content（這筆是剛新增的測試分類，沒有道具在用，可以刪)。

再驗證「有道具在用擋刪除」：用真實資料庫裡實際有道具在用的分類 slug（例如查
`curl -s http://localhost:3000/api/items` 找一筆真實道具的 `category` 值)：
```bash
curl -s -X DELETE http://localhost:3000/api/categories/<真實在用的slug>
```
Expected: 409，`{"error":"還有 N 件道具使用這個分類，無法刪除"}`（N 是實際數字)。

最後驗證 `createItem` 的分類驗證改用資料庫：
```bash
curl -s -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d '{"character_id":1,"name":"測試","category":"不存在的分類"}'
```
Expected: 400，`{"error":"category does not exist"}`（不要用真實 `character_id`，
隨便一個數字就好，因為分類驗證會先擋掉，不會真的寫入)。

---

## Task 2: `public/shared.js` — itemToLine 改簽名 + 圖示查找

**Files:**
- Modify: `public/shared.js`

**Interfaces:**
- Consumes: 無
- Produces: `itemToLine(item, categoryLabels)`（簽名變更，多一個參數)、
  `categoryIcon(slug)`（回傳一段 SVG 字串)。之後任務（index.html/wardrobe.html)會
  呼叫這兩個函式。

- [ ] **Step 1: 把整個 `public/shared.js` 改成：**

```js
const BUILTIN_CATEGORY_ICONS = {
  costume: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a2 2 0 1 1 4 0"/><path d="M12 4a2 2 0 1 0-4 0"/><path d="M12 4v3"/><path d="M4 20v-4.5c0-2 6-5.5 8-5.5s8 3.5 8 5.5V20H4Z"/></svg>',
  wig: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14c0-6 3.5-9 8-9s8 3 8 9"/><path d="M6 12c1-2 2-3 2-6M18 12c-1-2-2-3-2-6M12 6v3"/><path d="M4 14v3a1 1 0 0 0 1 1h1M20 14v3a1 1 0 0 1-1 1h-1"/></svg>',
  shoes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-4c2-.5 3-1.5 4-3 1.5 1.5 3 2 5 2h2c2.5 0 4.5 1 6 3v2H3Z"/></svg>',
  prop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/></svg>',
  lens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
};

const DEFAULT_CATEGORY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6M9 13h6M9 17h3"/></svg>';

function categoryIcon(slug) {
  return BUILTIN_CATEGORY_ICONS[slug] || DEFAULT_CATEGORY_ICON;
}

function itemToLine(item, categoryLabels) {
  const isLent = item.status === 'lent_out';
  const where = item.status === 'in_storage'
    ? `收納於：${item.location}`
    : isLent
      ? `借給：${item.borrower}`
      : '尚未指定位置';
  return `
    <li class="flex items-center justify-between gap-3 flex-wrap px-3 py-2 text-sm rounded-xl" style="background:#F2ECDE;border:1px solid #E4DBC5">
      <span>
        <span class="category-tag inline-block text-xs font-semibold px-2 py-0.5 rounded-full" style="background:#F6E2C9;color:#D98A4E">${categoryLabels[item.category] || item.category}</span>
        ${item.name}
      </span>
      <span class="status-line text-sm ${isLent ? 'lent font-semibold' : ''}" style="color:${isLent ? '#D98A4E' : '#8B8374'}">${where}</span>
    </li>
  `;
}
```

（`CATEGORY_LABELS` 這個寫死常數整個拿掉，`itemToLine` 多一個 `categoryLabels`
參數，呼叫端要自己準備這份 `{slug: name}` 對照表傳進來——見 Task 3/4。)

- [ ] **Step 2: 這個任務暫時不用啟動伺服器驗證**（`shared.js` 目前沒有任何頁面呼叫
它，Task 3/4 接上呼叫端後才有辦法真的驗證跑得動；直接跳到 Task 3。)

---

## Task 3: `public/index.html` — 分類下拉選單改成動態抓取

**Files:**
- Modify: `public/index.html`

**Interfaces:**
- Consumes: `itemToLine(item, categoryLabels)`、`categoryIcon(slug)`（Task 2 的
  `shared.js`)、`GET /api/categories`（Task 1)
- Produces: 無（頁面內部邏輯)

- [ ] **Step 1: 把「登記服裝道具」卡片裡類別下拉選單的寫死選項清空**

找到（`custom-select` 區塊裡)：
```html
              <ul class="cs-menu fixed z-50 bg-base-100 rounded-xl shadow-lg p-1 overflow-y-auto" style="max-height:min(320px, calc(100vh - 16px))" role="listbox" hidden>
                <li class="cs-option flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" role="option" data-value="costume" aria-selected="true">
                  <span class="cs-option-icon w-5 h-5 shrink-0" style="color:#3F5C46"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4a2 2 0 1 1 4 0"/><path d="M12 4a2 2 0 1 0-4 0"/><path d="M12 4v3"/><path d="M4 20v-4.5c0-2 6-5.5 8-5.5s8 3.5 8 5.5V20H4Z"/></svg></span>
                  <span class="cs-option-label">服裝</span>
                </li>
                <li class="cs-option flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" role="option" data-value="wig" aria-selected="false">
                  <span class="cs-option-icon w-5 h-5 shrink-0" style="color:#3F5C46"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14c0-6 3.5-9 8-9s8 3 8 9"/><path d="M6 12c1-2 2-3 2-6M18 12c-1-2-2-3-2-6M12 6v3"/><path d="M4 14v3a1 1 0 0 0 1 1h1M20 14v3a1 1 0 0 1-1 1h-1"/></svg></span>
                  <span class="cs-option-label">假髮</span>
                </li>
                <li class="cs-option flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" role="option" data-value="shoes" aria-selected="false">
                  <span class="cs-option-icon w-5 h-5 shrink-0" style="color:#3F5C46"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-4c2-.5 3-1.5 4-3 1.5 1.5 3 2 5 2h2c2.5 0 4.5 1 6 3v2H3Z"/></svg></span>
                  <span class="cs-option-label">鞋子</span>
                </li>
                <li class="cs-option flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" role="option" data-value="prop" aria-selected="false">
                  <span class="cs-option-icon w-5 h-5 shrink-0" style="color:#3F5C46"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z"/><path d="M4 8.5 12 13l8-4.5M12 13v7"/></svg></span>
                  <span class="cs-option-label">道具</span>
                </li>
                <li class="cs-option flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" role="option" data-value="lens" aria-selected="false">
                  <span class="cs-option-icon w-5 h-5 shrink-0" style="color:#3F5C46"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></span>
                  <span class="cs-option-label">隱眼</span>
                </li>
                <li class="cs-option flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" role="option" data-value="other" aria-selected="false">
                  <span class="cs-option-icon w-5 h-5 shrink-0" style="color:#3F5C46"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg></span>
                  <span class="cs-option-label">其他</span>
                </li>
              </ul>
              <select id="item-category" class="sr-only" required tabindex="-1" aria-hidden="true">
                <option value="costume">服裝</option>
                <option value="wig">假髮</option>
                <option value="shoes">鞋子</option>
                <option value="prop">道具</option>
                <option value="lens">隱眼</option>
                <option value="other">其他</option>
              </select>
```
改成（清空成空殼，JS 會動態填)：
```html
              <ul class="cs-menu fixed z-50 bg-base-100 rounded-xl shadow-lg p-1 overflow-y-auto" style="max-height:min(320px, calc(100vh - 16px))" role="listbox" hidden></ul>
              <select id="item-category" class="sr-only" required tabindex="-1" aria-hidden="true"></select>
```

- [ ] **Step 2: 修改 `<script>` 區塊，改成先抓分類、動態塞選項，再初始化 custom-select**

找到：
```js
document.querySelectorAll('.custom-select').forEach(initCustomSelect);

async function refreshCharacterDropdowns() {
```
改成：
```js
let categoryLabels = {};

async function loadCategoryOptions() {
  const categories = await fetch('/api/categories').then((r) => r.json());
  categoryLabels = Object.fromEntries(categories.map((c) => [c.slug, c.name]));

  const hiddenSelect = document.getElementById('item-category');
  hiddenSelect.innerHTML = categories
    .map((c) => `<option value="${c.slug}">${c.name}</option>`)
    .join('');

  const root = document.querySelector('.custom-select[data-target="item-category"]');
  const menu = root.querySelector('.cs-menu');
  menu.innerHTML = categories
    .map(
      (c, i) => `
        <li class="cs-option flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer" role="option" data-value="${c.slug}" aria-selected="${i === 0 ? 'true' : 'false'}">
          <span class="cs-option-icon w-5 h-5 shrink-0" style="color:#3F5C46">${categoryIcon(c.slug)}</span>
          <span class="cs-option-label">${c.name}</span>
        </li>
      `
    )
    .join('');

  initCustomSelect(root);
}

async function refreshCharacterDropdowns() {
```

（拿掉了原本無條件跑的 `document.querySelectorAll('.custom-select').forEach
(initCustomSelect);`——現在改成在 `loadCategoryOptions()` 內、選項填好之後才呼叫
`initCustomSelect(root)`，因為 `initCustomSelect` 會在初始化時讀取 `.cs-option`
清單，選項要先存在才有意義。這個頁面只有一個 `.custom-select`，所以不用 forEach。)

- [ ] **Step 3: 更新 `renderList`，把 `categoryLabels` 傳給 `itemToLine`**

找到：
```js
function renderList(elementId, items, emptyMessage) {
  const list = document.getElementById(elementId);
  if (items.length === 0) {
    list.innerHTML = `<li class="empty text-sm text-center py-3" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem">${emptyMessage}</li>`;
    return;
  }
  list.innerHTML = items.map(itemToLine).join('');
}
```
改成：
```js
function renderList(elementId, items, emptyMessage) {
  const list = document.getElementById(elementId);
  if (items.length === 0) {
    list.innerHTML = `<li class="empty text-sm text-center py-3" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem">${emptyMessage}</li>`;
    return;
  }
  list.innerHTML = items.map((item) => itemToLine(item, categoryLabels)).join('');
}
```

- [ ] **Step 4: 頁面載入時呼叫 `loadCategoryOptions()`**

找到檔案最後面：
```js
refreshCharacterDropdowns();
```
改成：
```js
loadCategoryOptions();
refreshCharacterDropdowns();
```

- [ ] **Step 5: Build CSS 並驗證**

Run: `npm run build:css`

```bash
cat > .dev-tools/verify_index_categories.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.click('.cs-trigger');
await page.waitForTimeout(200);
const optionCount = await page.$$eval('.cs-option', (els) => els.length);
const labels = await page.$$eval('.cs-option-label', (els) => els.map((e) => e.textContent));
console.log('pageErrors:', errors.length);
console.log('option count:', optionCount);
console.log('labels:', JSON.stringify(labels));
await browser.close();
EOF
node .dev-tools/verify_index_categories.mjs
rm .dev-tools/verify_index_categories.mjs
```
Expected: `pageErrors: 0`，`option count: 6`（目前資料庫有 6 個內建分類，假設 Task 1
驗證時新增的測試分類已經刪掉了)，`labels` 是 `["服裝","假髮","鞋子","道具","隱眼","其他"]`
依 `sort_order` 排序。

再驗證搜尋結果的分類標籤還能正確顯示中文（不是顯示 slug)：
```bash
cat > .dev-tools/verify_index_search.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.click('#search-form button[type=submit]');
await page.waitForTimeout(300);
const tagText = await page.$$eval('.category-tag', (els) => els.map((e) => e.textContent));
console.log('category tags shown:', JSON.stringify(tagText));
await browser.close();
EOF
node .dev-tools/verify_index_search.mjs
rm .dev-tools/verify_index_search.mjs
```
Expected: `category tags shown` 陣列裡的值是中文名稱（例如 `"假髮"`），不是 slug
（不會看到 `"wig"` 這種英文值)——如果看到英文 slug，代表 `categoryLabels` 沒有正確
組成或 `loadCategoryOptions()` 沒有在 `renderList` 呼叫之前完成，回頭檢查 Step 2-4。

---

## Task 4: `public/wardrobe.html` — 分類篩選改成動態抓取

**Files:**
- Modify: `public/wardrobe.html`

**Interfaces:**
- Consumes: `itemToLine(item, categoryLabels)`（Task 2)、`GET /api/categories`（Task 1)
- Produces: 無

- [ ] **Step 1: 把 `#filter-category` 的寫死選項清空，只留「全部分類」**

找到：
```html
        <select id="filter-category" class="select w-full h-11 min-h-0" style="background:#F2ECDE;border-color:#E4DBC5">
          <option value="">全部分類</option>
          <option value="costume">服裝</option>
          <option value="wig">假髮</option>
          <option value="shoes">鞋子</option>
          <option value="prop">道具</option>
          <option value="lens">隱眼</option>
          <option value="other">其他</option>
        </select>
```
改成：
```html
        <select id="filter-category" class="select w-full h-11 min-h-0" style="background:#F2ECDE;border-color:#E4DBC5">
          <option value="">全部分類</option>
        </select>
```

- [ ] **Step 2: 修改 `<script>`，加入 `loadCategories()`，`renderWardrobe` 改用
`categoryLabels`**

找到：
```js
let allCharacters = [];
let currentItemsByChar = new Map();
const expandedIds = new Set();
```
改成：
```js
let allCharacters = [];
let currentItemsByChar = new Map();
let categoryLabels = {};
const expandedIds = new Set();

async function loadCategories() {
  const categories = await fetch('/api/categories').then((r) => r.json());
  categoryLabels = Object.fromEntries(categories.map((c) => [c.slug, c.name]));
  const select = document.getElementById('filter-category');
  const optionsHtml = categories.map((c) => `<option value="${c.slug}">${c.name}</option>`).join('');
  select.insertAdjacentHTML('beforeend', optionsHtml);
}
```

找到 `renderWardrobe` 裡的：
```js
        <ul class="flex flex-col gap-2 px-6 pb-6 m-0 list-none ${isOpen ? '' : 'hidden'}">
          ${items.map(itemToLine).join('')}
        </ul>
```
改成：
```js
        <ul class="flex flex-col gap-2 px-6 pb-6 m-0 list-none ${isOpen ? '' : 'hidden'}">
          ${items.map((item) => itemToLine(item, categoryLabels)).join('')}
        </ul>
```

找到 `init()`：
```js
(async function init() {
  const errorEl = document.getElementById('wardrobe-error');
  try {
    allCharacters = await fetchCharacters();
    await refreshItems();
  } catch (err) {
    errorEl.classList.remove('hidden');
  }
})();
```
改成：
```js
(async function init() {
  const errorEl = document.getElementById('wardrobe-error');
  try {
    await loadCategories();
    allCharacters = await fetchCharacters();
    await refreshItems();
  } catch (err) {
    errorEl.classList.remove('hidden');
  }
})();
```

- [ ] **Step 3: Build CSS 並驗證**

Run: `npm run build:css`

```bash
cat > .dev-tools/verify_wardrobe_categories.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:3000/wardrobe.html', { waitUntil: 'networkidle' });
const optionTexts = await page.$$eval('#filter-category option', (els) => els.map((e) => e.textContent));
const tagTexts = await page.$$eval('.category-tag', (els) => els.map((e) => e.textContent));
console.log('pageErrors:', errors.length);
console.log('filter options:', JSON.stringify(optionTexts));
console.log('rendered category tags:', JSON.stringify(tagTexts));
await browser.close();
EOF
node .dev-tools/verify_wardrobe_categories.mjs
rm .dev-tools/verify_wardrobe_categories.mjs
```
Expected: `pageErrors: 0`；`filter options` 第一項是 `"全部分類"`，後面接著 6 個中文
分類名稱；`rendered category tags` 顯示的是中文名稱，不是 slug。

---

## Task 5: `public/settings.html` — 分類管理介面 + 導覽串接

**Files:**
- Create: `public/settings.html`
- Modify: `public/index.html`（底部導覽)
- Modify: `public/wardrobe.html`（底部導覽)

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /api/categories`（Task 1)
- Produces: 無

- [ ] **Step 1: 建立 `public/settings.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant" data-theme="costume">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>設置 · 服裝道具管家</title>
<link rel="stylesheet" href="style.css">
</head>
<body class="bg-base-200 text-base-content font-sans m-0">
<div class="relative max-w-[1080px] mx-auto px-5 py-8 pb-26">

  <header class="text-center mb-8">
    <h1 class="text-2xl font-bold m-0">設置</h1>
    <p class="text-[0.95rem] mt-2" style="color:#8B8374">管理分類：新增、改名、調整順序、刪除。</p>
  </header>

  <section class="card relative bg-base-100 shadow-md p-6 mb-6" style="border:1px solid #E4DBC5;border-radius:1.625rem">
    <h2 class="font-bold text-base-content m-0 mb-4">分類管理</h2>
    <ul id="category-list" class="flex flex-col gap-2 list-none p-0 m-0"></ul>
    <p id="category-error" class="text-sm text-center py-3 mt-3 hidden" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem"></p>
    <form id="category-add-form" class="flex gap-3 mt-4">
      <input type="text" id="category-new-name" placeholder="新增分類名稱" class="input flex-1 h-11 min-h-0" style="background:#F2ECDE;border-color:#E4DBC5">
      <button type="submit" class="btn btn-primary h-11 min-h-0">新增分類</button>
    </form>
  </section>

</div>

<nav class="fixed left-0 right-0 bottom-0 z-20 flex justify-center gap-8 bg-base-100 px-4 py-2 shadow-[0_-4px_16px_rgba(55,51,44,0.06)]" style="border-top:1px solid #E4DBC5" aria-label="主要導覽">
  <a href="index.html" class="nav-item flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-home">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/></svg>
    <span>首頁</span>
  </a>
  <a href="wardrobe.html" class="nav-item flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-wardrobe">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M8 7h8l3 4v9H5v-9l3-4Z"/><path d="M5 13h14"/></svg>
    <span>我的穿衣櫃</span>
  </a>
  <a href="settings.html" class="nav-item is-active flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-settings">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 3l-2 1.5 2 3.5 2.4-1c.8.65 1.66 1.16 2.6 1.5L10 22h4l.4-2.5c.94-.34 1.8-.85 2.6-1.5l2.4 1 2-3.5-2-1.5Z"/></svg>
    <span>設置</span>
  </a>
</nav>

<style>
  .nav-item.is-active { color: #3F5C46; }
  .nav-item:not(.is-active) { color: #8B8374; }
</style>

<script src="shared.js"></script>
<script>
async function fetchCategories() {
  const res = await fetch('/api/categories');
  if (!res.ok) throw new Error('categories fetch failed');
  return res.json();
}

function renderCategories(categories) {
  const list = document.getElementById('category-list');
  list.innerHTML = categories
    .map(
      (c, i) => `
        <li class="flex items-center justify-between gap-3 px-3 py-2 rounded-xl" style="background:#F2ECDE;border:1px solid #E4DBC5" data-slug="${c.slug}">
          <span class="flex items-center gap-2">
            <span class="w-5 h-5 shrink-0" style="color:#3F5C46">${categoryIcon(c.slug)}</span>
            <span class="category-name">${c.name}</span>
          </span>
          <span class="flex items-center gap-2">
            <button type="button" class="btn-move-up h-8 min-h-0 px-2" ${i === 0 ? 'disabled' : ''} title="上移">↑</button>
            <button type="button" class="btn-move-down h-8 min-h-0 px-2" ${i === categories.length - 1 ? 'disabled' : ''} title="下移">↓</button>
            <button type="button" class="btn-rename h-8 min-h-0 px-2" title="改名">改名</button>
            <button type="button" class="btn-delete h-8 min-h-0 px-2" style="color:#D98A4E" title="刪除">刪除</button>
          </span>
        </li>
      `
    )
    .join('');

  list.querySelectorAll('li').forEach((li) => {
    const slug = li.dataset.slug;

    li.querySelector('.btn-move-up').addEventListener('click', () => moveCategory(slug, 'up'));
    li.querySelector('.btn-move-down').addEventListener('click', () => moveCategory(slug, 'down'));

    li.querySelector('.btn-rename').addEventListener('click', () => {
      const nameEl = li.querySelector('.category-name');
      const currentName = nameEl.textContent;
      nameEl.outerHTML = `<input type="text" class="category-rename-input input h-8 min-h-0" value="${currentName}" style="background:#F2ECDE;border-color:#E4DBC5">`;
      const input = li.querySelector('.category-rename-input');
      input.focus();
      input.select();
      const commit = () => renameCategory(slug, input.value);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') refreshCategories();
      });
      input.addEventListener('blur', commit);
    });

    li.querySelector('.btn-delete').addEventListener('click', () => deleteCategory(slug));
  });
}

async function refreshCategories() {
  const errorEl = document.getElementById('category-error');
  try {
    const categories = await fetchCategories();
    errorEl.classList.add('hidden');
    renderCategories(categories);
  } catch (err) {
    errorEl.textContent = '資料載入失敗，請重新整理頁面。';
    errorEl.classList.remove('hidden');
  }
}

function showError(message) {
  const errorEl = document.getElementById('category-error');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

async function moveCategory(slug, direction) {
  const res = await fetch(`/api/categories/${slug}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
  });
  if (!res.ok) {
    const err = await res.json();
    showError(err.error);
    return;
  }
  await refreshCategories();
}

async function renameCategory(slug, name) {
  const res = await fetch(`/api/categories/${slug}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json();
    showError(err.error);
  }
  await refreshCategories();
}

async function deleteCategory(slug) {
  const res = await fetch(`/api/categories/${slug}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const err = await res.json();
    showError(err.error);
    return;
  }
  await refreshCategories();
}

document.getElementById('category-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('category-new-name');
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json();
    showError(err.error);
    return;
  }
  input.value = '';
  await refreshCategories();
});

refreshCategories();
</script>
</body>
</html>
```

- [ ] **Step 2: 修改 `public/index.html` 底部導覽，把「設置」從灰色佔位改成真連結**

找到：
```html
  <button type="button" class="nav-item is-disabled flex flex-col items-center gap-1 px-3 py-1 text-xs opacity-45 cursor-not-allowed" id="nav-settings" disabled title="即將推出">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 3l-2 1.5 2 3.5 2.4-1c.8.65 1.66 1.16 2.6 1.5L10 22h4l.4-2.5c.94-.34 1.8-.85 2.6-1.5l2.4 1 2-3.5-2-1.5Z"/></svg>
    <span>設置</span>
  </button>
```
改成：
```html
  <a href="settings.html" class="nav-item flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-settings">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 3l-2 1.5 2 3.5 2.4-1c.8.65 1.66 1.16 2.6 1.5L10 22h4l.4-2.5c.94-.34 1.8-.85 2.6-1.5l2.4 1 2-3.5-2-1.5Z"/></svg>
    <span>設置</span>
  </a>
```

- [ ] **Step 3: 對 `public/wardrobe.html` 做一模一樣的修改**

`wardrobe.html` 底部導覽的 `nav-settings` 目前跟 `index.html` 改之前的內容一字不差，
套用跟 Step 2 完全相同的 before/after。

- [ ] **Step 4: Build CSS 並驗證整個分類管理流程**

Run: `npm run build:css`

```bash
cat > .dev-tools/verify_settings.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:3000/settings.html', { waitUntil: 'networkidle' });

const initialCount = await page.$$eval('#category-list li', (els) => els.length);

// add
await page.fill('#category-new-name', 'Plan驗證分類');
await page.click('#category-add-form button[type=submit]');
await page.waitForTimeout(300);
const afterAdd = await page.$$eval('#category-list .category-name', (els) => els.map((e) => e.textContent));
const addedLi = await page.$('#category-list li:last-child');
const addedSlug = await page.evaluate((li) => li.dataset.slug, addedLi);

// rename
await page.click(`#category-list li[data-slug="${addedSlug}"] .btn-rename`);
await page.fill(`#category-list li[data-slug="${addedSlug}"] .category-rename-input`, '改名後分類');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const afterRename = await page.$eval(`#category-list li[data-slug="${addedSlug}"] .category-name`, (el) => el.textContent);

// move up
await page.click(`#category-list li[data-slug="${addedSlug}"] .btn-move-up`);
await page.waitForTimeout(300);
const namesAfterMove = await page.$$eval('#category-list .category-name', (els) => els.map((e) => e.textContent));

// delete
await page.click(`#category-list li[data-slug="${addedSlug}"] .btn-delete`);
await page.waitForTimeout(300);
const afterDeleteCount = await page.$$eval('#category-list li', (els) => els.length);

console.log('pageErrors:', errors.length);
console.log('initial count:', initialCount);
console.log('after add labels:', JSON.stringify(afterAdd));
console.log('after rename:', afterRename);
console.log('names after move:', JSON.stringify(namesAfterMove));
console.log('count after delete (should match initial):', afterDeleteCount);
await browser.close();
EOF
node .dev-tools/verify_settings.mjs
rm .dev-tools/verify_settings.mjs
```
Expected: `pageErrors: 0`；`after add labels` 包含 `"Plan驗證分類"`；`after rename`
是 `"改名後分類"`；`names after move` 裡「改名後分類」出現的位置比 add 時往前移了
一格；`count after delete` 跟 `initial count` 相等（測試分類清乾淨了)。

再驗證「有道具在用擋刪除」在 UI 上會顯示錯誤訊息（用真實資料庫裡有道具在用的分類)：
```bash
cat > .dev-tools/verify_settings_delete_block.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000/settings.html', { waitUntil: 'networkidle' });
// 用第一筆（服裝/costume，假設真實資料庫裡有道具在用）測試刪除擋下
const firstSlug = await page.$eval('#category-list li', (el) => el.dataset.slug);
await page.click(`#category-list li[data-slug="${firstSlug}"] .btn-delete`);
await page.waitForTimeout(300);
const errorVisible = await page.$eval('#category-error', (el) => !el.classList.contains('hidden'));
const errorText = await page.$eval('#category-error', (el) => el.textContent);
console.log('error visible:', errorVisible);
console.log('error text:', errorText);
await browser.close();
EOF
node .dev-tools/verify_settings_delete_block.mjs
rm .dev-tools/verify_settings_delete_block.mjs
```
Expected: 如果第一筆分類（服裝)在真實資料庫裡確實有道具在用，`error visible: true`，
`error text` 包含「無法刪除」字樣。如果你的真實資料庫裡剛好沒有道具用「服裝」這個
分類，這個驗證會顯示刪除成功而不是錯誤——如果發生這種情況，改用
`curl http://localhost:3000/api/items` 找一個真實有在用的 `category` 值，手動在瀏覽器
裡點該分類的刪除按鈕確認錯誤訊息正確顯示，不要真的讓它刪除掉還在使用的分類。

最後用 Playwright 截圖確認三個頁面的底部導覽都正確顯示、`設置` 在對應頁面上是綠色
`is-active`（`node .dev-tools/shot.mjs http://localhost:3000/settings.html
.dev-tools/settings_check.png 1280 900`，Read 工具看過，看完刪除截圖)。

---

## Self-Review Notes

- Spec coverage：design.md 的「資料模型」「後端API」「前端串接」「設置頁面」
  「資料庫遷移」「錯誤處理」六段，分別對應 Task 1（資料模型+API+遷移)、Task 2/3/4
  （前端串接)、Task 5（設置頁面+錯誤處理 UI)。「測試」段落（不新增框架、curl+
  Playwright)整份 plan 都遵守。「範圍外」六項（Excel匯出/分享連結/雲端/開源/多人版/
  手機UI一致性)這份 plan 完全沒有觸碰，符合設計。
- Placeholder scan：無 TBD/TODO，每個 Step 都有完整可執行的程式碼跟指令。
- Type/命名一致性：`slug`/`name`/`sort_order`/`is_builtin`、`categoryLabels`、
  `categoryIcon`、`itemToLine(item, categoryLabels)` 在 Task 1-5 之間命名一致，
  跟現有 `character_id`/`item.category` 等既有欄位命名風格也一致。
