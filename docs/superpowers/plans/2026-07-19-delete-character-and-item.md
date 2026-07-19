# Delete Character and Delete Item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let the user permanently delete a character (cascading to delete every item registered under it) from `public/settings.html`, and permanently delete a single item from `public/wardrobe.html` — neither currently exists anywhere in the app (confirmed: `src/models/character.js` only has create/list/getById, `src/models/item.js` only has create/search/update, no delete route exists on either `src/routes/characters.js` or `src/routes/items.js`).

**Architecture:** Two new model functions (`deleteCharacter`, `deleteItem`) and two new Express routes, following the exact 404/204 pattern already used by `src/routes/categories.js`'s `DELETE /:slug`. Character deletion must delete all of that character's items first, then the character row, in one atomic operation — `items.character_id` has no `ON DELETE CASCADE` in `src/db/schema.sql`, and `src/models/category.js`'s `moveCategory` already establishes the pattern for atomic multi-statement writes via `db.batch([...])` (works identically against both the local better-sqlite3 driver and the Turso driver — same interface, confirmed in `src/db/drivers/local.js` and used today by `moveCategory`). On the frontend, `public/shared.js`'s `itemToLine(item, categoryLabels)` is reused in three existing places (`index.html`'s search results, its 角色完整清單/loadout results, and its off-screen image-export capture container) — none of those three should grow a delete button, especially not the export capture (that would put a delete button inside the exported PNG). `itemToLine` gets a new optional third parameter that only `wardrobe.html` actually uses.

**Tech Stack:** Express 4 async route handlers (existing `asyncHandler` wrapper), vanilla browser JS (no bundler, matches every other page in `public/`), native `window.confirm()` for destructive-action confirmation (no dialog library exists in this project).

## Global Constraints

- No schema changes. `items.character_id` stays `NOT NULL REFERENCES characters(id)` with no cascade — the atomic-order-of-operations (items first, then the character) is what keeps this safe, not a schema change.
- Deleting a character must delete its items in the *same* atomic `db.batch()` call — never as two separate awaited calls, which could leave orphaned items if the process crashes between them.
- `itemToLine(item, categoryLabels, extraHtml = '')`'s new third parameter must default to `''` so all three existing call sites in `public/index.html` keep working with zero changes to their call syntax.
- Follow this codebase's existing convention of not HTML-escaping user-entered strings before inserting via `innerHTML` (see `public/settings.html`'s existing category rows, `public/index.html`'s dropdowns, `shared.js`'s `itemToLine`) — this is a single-password, non-multi-tenant local tool; don't introduce escaping in only the new code added by this plan.
- Every destructive action added by this plan (both character delete and item delete) must be gated behind a native `window.confirm()` — unlike `deleteCategory` (which needs no confirm because it self-protects by refusing to delete a non-empty category), both new deletes here have no such protection and are one click from data loss.
- No test framework exists in this project — verification throughout this plan is manual: real `curl`/Playwright scripts, written and deleted per-task, matching this project's established convention (see `docs/superpowers/plans/2026-07-19-inventory-image-export.md`'s Task 2 for the exact style, and `specs/003-category-management/plan.md` for the original precedent).

---

### Task 1: Backend — delete character (cascade) and delete item

**Files:**
- Modify: `src/models/character.js`
- Modify: `src/models/item.js`
- Modify: `src/routes/characters.js`
- Modify: `src/routes/items.js`

**Interfaces:**
- Produces: `deleteCharacter(id)` — async, returns `true` on success, `null` if the character doesn't exist. `deleteItem(id)` — async, returns `true` on success, `null` if the item doesn't exist. Both consumed by Task 1's own routes only; no later task touches these model functions directly (Tasks 2 and 3 only ever call the HTTP routes).
- Produces routes: `DELETE /api/characters/:id` → 204 on success, 404 `{ error: 'character not found' }` if missing. `DELETE /api/items/:id` → 204 on success, 404 `{ error: 'item not found' }` if missing. These two routes are what Tasks 2 and 3 call from the browser.

- [ ] **Step 1: Add `deleteCharacter` to the character model**

Current end of `src/models/character.js`:
```js
export async function getCharacterById(id) {
  return db.get('SELECT * FROM characters WHERE id = ?', [id]);
}
```

Add immediately after it:
```js

export async function deleteCharacter(id) {
  const existing = await getCharacterById(id);
  if (!existing) return null;
  await db.batch([
    { sql: 'DELETE FROM items WHERE character_id = ?', params: [id] },
    { sql: 'DELETE FROM characters WHERE id = ?', params: [id] },
  ]);
  return true;
}
```

- [ ] **Step 2: Add `deleteItem` to the item model**

In `src/models/item.js`, find:
```js
export async function updateItem(id, patch) {
```
...and its closing `}` a few lines below (ends with `return getItemById(id);` then `}`). Add `deleteItem` immediately after `updateItem`'s closing brace, before `allItemsWithCharacters`:

```js

export async function deleteItem(id) {
  const existing = await getItemById(id);
  if (!existing) return null;
  await db.run('DELETE FROM items WHERE id = ?', [id]);
  return true;
}
```

- [ ] **Step 3: Add the DELETE route for characters**

In `src/routes/characters.js`, change the import line from:
```js
import { createCharacter, listCharacters, getCharacterById } from '../models/character.js';
```
to:
```js
import { createCharacter, listCharacters, getCharacterById, deleteCharacter } from '../models/character.js';
```

Then add this route at the end of the file, right before `export default router;`:
```js

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await deleteCharacter(req.params.id);
  if (!result) return res.status(404).json({ error: 'character not found' });
  res.status(204).end();
}));
```

- [ ] **Step 4: Add the DELETE route for items**

In `src/routes/items.js`, change the import line from:
```js
import { createItem, searchItems, updateItem, getItemById } from '../models/item.js';
```
to:
```js
import { createItem, searchItems, updateItem, getItemById, deleteItem } from '../models/item.js';
```

Then add this route *before* the existing central error handler (`router.use((err, req, res, next) => {...})` at the end of the file) — insert it right after the existing `PATCH /:id` route:
```js

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await deleteItem(req.params.id);
  if (!result) return res.status(404).json({ error: 'item not found' });
  res.status(204).end();
}));
```

- [ ] **Step 5: Start the dev server**

```bash
npm run dev
```
Expected: `Costume Manager running at http://localhost:3000`. Leave running for the next step.

- [ ] **Step 6: Manual verification via curl**

Run each command in order (uses `-s` for quiet output, `-w` to print the HTTP status so you can confirm without parsing JSON by hand):

```bash
# Create a throwaway test character
CHAR_ID=$(curl -s -X POST http://localhost:3000/api/characters -H "Content-Type: application/json" -d '{"name":"測試角色XYZ"}' | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).id))")
echo "created character id: $CHAR_ID"

# Create an item under it
ITEM_ID=$(curl -s -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d "{\"character_id\":$CHAR_ID,\"name\":\"測試道具\",\"category\":\"prop\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).id))")
echo "created item id: $ITEM_ID"

# Delete just the item
curl -s -o /dev/null -w "DELETE item: HTTP %{http_code} (expect 204)\n" -X DELETE "http://localhost:3000/api/items/$ITEM_ID"

# Confirm the item is gone but the character remains
curl -s "http://localhost:3000/api/characters/$CHAR_ID/items" && echo " (expect: [])"
curl -s "http://localhost:3000/api/characters" | grep -q "測試角色XYZ" && echo "character still present (expected)"

# Add another item, then delete the whole character
ITEM2_ID=$(curl -s -X POST http://localhost:3000/api/items -H "Content-Type: application/json" -d "{\"character_id\":$CHAR_ID,\"name\":\"測試道具2\",\"category\":\"prop\"}" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).id))")
curl -s -o /dev/null -w "DELETE character: HTTP %{http_code} (expect 204)\n" -X DELETE "http://localhost:3000/api/characters/$CHAR_ID"

# Confirm character AND its item are both gone
curl -s "http://localhost:3000/api/characters" | grep -q "測試角色XYZ" && echo "BUG: character still present" || echo "character correctly removed"
curl -s "http://localhost:3000/api/items?character_id=$CHAR_ID" && echo " (expect: [])"

# Confirm 404s for already-gone / never-existed IDs
curl -s -o /dev/null -w "DELETE nonexistent character: HTTP %{http_code} (expect 404)\n" -X DELETE "http://localhost:3000/api/characters/999999"
curl -s -o /dev/null -w "DELETE nonexistent item: HTTP %{http_code} (expect 404)\n" -X DELETE "http://localhost:3000/api/items/$ITEM2_ID"
```

Expected: every `HTTP %{http_code}` line matches its comment, both `(expect: [])` lines print `[]`, and `character correctly removed` prints (not the BUG line). If the BUG line prints, stop — the batch delete in `deleteCharacter` didn't work and needs debugging before continuing to Task 2.

- [ ] **Step 7: Commit**

```bash
git add src/models/character.js src/models/item.js src/routes/characters.js src/routes/items.js
git commit -m "Add cascading character delete and single item delete endpoints"
```

---

### Task 2: Item delete button on the wardrobe page

**Files:**
- Modify: `public/shared.js`
- Modify: `public/wardrobe.html`

**Interfaces:**
- Consumes: `DELETE /api/items/:id` (Task 1, returns 204/404).
- Modifies: `itemToLine(item, categoryLabels)` → `itemToLine(item, categoryLabels, extraHtml = '')`. `public/index.html`'s three existing call sites (`itemToLine(item, categoryLabels)` in its search results and loadout results, plus the export-capture container) are unaffected — they still call it with two arguments, which still works because of the default.

- [ ] **Step 1: Give `itemToLine` an optional third parameter**

In `public/shared.js`, replace:
```js
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

with:
```js
function itemToLine(item, categoryLabels, extraHtml = '') {
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
      ${extraHtml}
    </li>
  `;
}
```

- [ ] **Step 2: Pass a delete button as `extraHtml` from `wardrobe.html`, and wire it up**

In `public/wardrobe.html`, find `renderWardrobe`:
```js
function renderWardrobe() {
  const list = document.getElementById('wardrobe-list');
  const rows = allCharacters
    .map((c) => ({ char: c, items: currentItemsByChar.get(c.id) || [] }))
    .filter((row) => row.items.length > 0);

  if (rows.length === 0) {
    list.innerHTML = '<p class="text-sm text-center py-3" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem">沒有符合條件的道具</p>';
    return;
  }

  list.innerHTML = rows.map(({ char, items }) => {
    const isOpen = expandedIds.has(char.id);
    return `
      <section class="card relative bg-base-100 shadow-md overflow-hidden" style="border:1px solid #E4DBC5;border-radius:1.625rem">
        <button type="button" class="wardrobe-char-toggle w-full flex items-center justify-between gap-3 px-6 py-5 text-left" data-char-id="${char.id}">
          <span class="font-bold text-base-content">${char.name}（${items.length}）</span>
          <svg class="w-5 h-5 shrink-0" style="color:#8B8374;transform:rotate(${isOpen ? '180deg' : '0deg'})" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <ul class="flex flex-col gap-2 px-6 pb-6 m-0 list-none ${isOpen ? '' : 'hidden'}">
          ${items.map((item) => itemToLine(item, categoryLabels)).join('')}
        </ul>
      </section>
    `;
  }).join('');

  list.querySelectorAll('.wardrobe-char-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.charId);
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      renderWardrobe();
    });
  });
}
```

Replace it entirely with:
```js
function itemDeleteButtonHtml(item) {
  return `<button type="button" class="btn-delete-item h-8 min-h-0 px-2" data-item-id="${item.id}" style="color:#D98A4E" title="刪除道具">刪除</button>`;
}

function renderWardrobe() {
  const list = document.getElementById('wardrobe-list');
  const rows = allCharacters
    .map((c) => ({ char: c, items: currentItemsByChar.get(c.id) || [] }))
    .filter((row) => row.items.length > 0);

  if (rows.length === 0) {
    list.innerHTML = '<p class="text-sm text-center py-3" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem">沒有符合條件的道具</p>';
    return;
  }

  list.innerHTML = rows.map(({ char, items }) => {
    const isOpen = expandedIds.has(char.id);
    return `
      <section class="card relative bg-base-100 shadow-md overflow-hidden" style="border:1px solid #E4DBC5;border-radius:1.625rem">
        <button type="button" class="wardrobe-char-toggle w-full flex items-center justify-between gap-3 px-6 py-5 text-left" data-char-id="${char.id}">
          <span class="font-bold text-base-content">${char.name}（${items.length}）</span>
          <svg class="w-5 h-5 shrink-0" style="color:#8B8374;transform:rotate(${isOpen ? '180deg' : '0deg'})" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <ul class="flex flex-col gap-2 px-6 pb-6 m-0 list-none ${isOpen ? '' : 'hidden'}">
          ${items.map((item) => itemToLine(item, categoryLabels, itemDeleteButtonHtml(item))).join('')}
        </ul>
      </section>
    `;
  }).join('');

  list.querySelectorAll('.wardrobe-char-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.charId);
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      renderWardrobe();
    });
  });

  list.querySelectorAll('.btn-delete-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('確定要刪除這個道具嗎？此動作無法復原')) return;
      await fetch(`/api/items/${btn.dataset.itemId}`, { method: 'DELETE' });
      await refreshItems();
    });
  });
}
```

Note: the delete button lives inside the `<ul>`, which is a *sibling* of the `.wardrobe-char-toggle` button (not nested inside it) — so there's no invalid nested-`<button>` HTML and no click-event bubbling into the toggle's expand/collapse handler.

- [ ] **Step 3: Start the dev server (if not already running from Task 1)**

```bash
npm run dev
```

- [ ] **Step 4: Write a throwaway Playwright verification script**

Create `.dev-tools/verify-item-delete.mjs` (temporary — deleted in Step 6):

```js
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

// Setup: a throwaway character with two items, via the API directly
const char = await fetch(`${BASE}/api/characters`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '測試角色-道具刪除' }),
}).then((r) => r.json());

const item1 = await fetch(`${BASE}/api/items`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ character_id: char.id, name: '測試道具A', category: 'prop' }),
}).then((r) => r.json());

const item2 = await fetch(`${BASE}/api/items`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ character_id: char.id, name: '測試道具B', category: 'prop' }),
}).then((r) => r.json());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

// Auto-accept the native confirm() dialog the delete button triggers
page.on('dialog', (dialog) => dialog.accept());

await page.goto(`${BASE}/wardrobe.html`, { waitUntil: 'networkidle' });

// Expand this test character's section
await page.click(`button.wardrobe-char-toggle[data-char-id="${char.id}"]`);

// Delete item1 only
await page.click(`button.btn-delete-item[data-item-id="${item1.id}"]`);
await page.waitForTimeout(500); // allow the DELETE + refreshItems() round-trip to settle

const remainingItems = await fetch(`${BASE}/api/items?character_id=${char.id}`).then((r) => r.json());
console.log('items remaining after deleting item1:', remainingItems.map((i) => i.name));
console.log('expected: only 測試道具B remains:', remainingItems.length === 1 && remainingItems[0].id === item2.id);

// Cleanup: delete the character (cascades the remaining item too — exercised again properly in Task 3)
await fetch(`${BASE}/api/characters/${char.id}`, { method: 'DELETE' });

await browser.close();
```

- [ ] **Step 5: Run it**

```bash
node .dev-tools/verify-item-delete.mjs
```

Expected output:
```
items remaining after deleting item1: [ '測試道具B' ]
expected: only 測試道具B remains: true
```

- [ ] **Step 6: Delete the throwaway script**

```bash
rm .dev-tools/verify-item-delete.mjs
```

- [ ] **Step 7: Commit**

```bash
git add public/shared.js public/wardrobe.html
git commit -m "Add per-item delete button to the wardrobe page"
```

---

### Task 3: Character management (delete) on the settings page

**Files:**
- Modify: `public/settings.html`

**Interfaces:**
- Consumes: `GET /api/characters` (existing, unfiltered — returns every character regardless of item count), `DELETE /api/characters/:id` (Task 1, returns 204/404).

- [ ] **Step 1: Add the "角色管理" section markup**

In `public/settings.html`, find:
```html
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
```

Replace with (adds a new section, right after the existing one, before the closing `</div>`):
```html
  <section class="card relative bg-base-100 shadow-md p-6 mb-6" style="border:1px solid #E4DBC5;border-radius:1.625rem">
    <h2 class="font-bold text-base-content m-0 mb-4">分類管理</h2>
    <ul id="category-list" class="flex flex-col gap-2 list-none p-0 m-0"></ul>
    <p id="category-error" class="text-sm text-center py-3 mt-3 hidden" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem"></p>
    <form id="category-add-form" class="flex gap-3 mt-4">
      <input type="text" id="category-new-name" placeholder="新增分類名稱" class="input flex-1 h-11 min-h-0" style="background:#F2ECDE;border-color:#E4DBC5">
      <button type="submit" class="btn btn-primary h-11 min-h-0">新增分類</button>
    </form>
  </section>

  <section class="card relative bg-base-100 shadow-md p-6" style="border:1px solid #E4DBC5;border-radius:1.625rem">
    <h2 class="font-bold text-base-content m-0 mb-4">角色管理</h2>
    <ul id="character-list" class="flex flex-col gap-2 list-none p-0 m-0"></ul>
    <p id="character-error" class="text-sm text-center py-3 mt-3 hidden" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem"></p>
  </section>

</div>
```

Note the removed `mb-6` on the new section (it's the last card on the page, matching how `分類管理` had no bottom margin before this plan added a sibling after it).

- [ ] **Step 2: Add the character list fetch/render/delete script**

In `public/settings.html`, find the last line of the script block:
```js
refreshCategories();
</script>
```

Replace with:
```js
async function fetchCharacterList() {
  const res = await fetch('/api/characters');
  if (!res.ok) throw new Error('characters fetch failed');
  return res.json();
}

function renderCharacterList(characters) {
  const list = document.getElementById('character-list');
  if (characters.length === 0) {
    list.innerHTML = '<li class="text-sm text-center py-3" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem">尚未新增角色</li>';
    return;
  }
  list.innerHTML = characters
    .map(
      (c) => `
        <li class="flex items-center justify-between gap-3 px-3 py-2 rounded-xl" style="background:#F2ECDE;border:1px solid #E4DBC5" data-char-id="${c.id}">
          <span class="character-name">${c.name}</span>
          <button type="button" class="btn-delete-character h-8 min-h-0 px-2" style="color:#D98A4E" title="刪除">刪除</button>
        </li>
      `
    )
    .join('');

  list.querySelectorAll('li').forEach((li) => {
    const id = li.dataset.charId;
    const name = li.querySelector('.character-name').textContent;
    li.querySelector('.btn-delete-character').addEventListener('click', () => deleteCharacterRow(id, name));
  });
}

async function refreshCharacterList() {
  const errorEl = document.getElementById('character-error');
  try {
    const characters = await fetchCharacterList();
    errorEl.classList.add('hidden');
    renderCharacterList(characters);
  } catch (err) {
    errorEl.textContent = '資料載入失敗，請重新整理頁面。';
    errorEl.classList.remove('hidden');
  }
}

async function deleteCharacterRow(id, name) {
  if (!window.confirm(`確定要刪除「${name}」嗎？這個角色底下的所有服裝道具也會一起被刪除，此動作無法復原`)) return;
  const res = await fetch(`/api/characters/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) {
    const err = await res.json();
    const errorEl = document.getElementById('character-error');
    errorEl.textContent = err.error;
    errorEl.classList.remove('hidden');
    return;
  }
  await refreshCharacterList();
}

refreshCategories();
refreshCharacterList();
</script>
```

- [ ] **Step 3: Start the dev server (if not already running)**

```bash
npm run dev
```

- [ ] **Step 4: Write a throwaway Playwright verification script**

Create `.dev-tools/verify-character-delete.mjs` (temporary — deleted in Step 6):

```js
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';

// Setup: a throwaway character with one item, via the API directly
const char = await fetch(`${BASE}/api/characters`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: '測試角色-角色刪除' }),
}).then((r) => r.json());

await fetch(`${BASE}/api/items`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ character_id: char.id, name: '測試道具', category: 'prop' }),
}).then((r) => r.json());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('dialog', (dialog) => dialog.accept());

await page.goto(`${BASE}/settings.html`, { waitUntil: 'networkidle' });

const rowExistsBefore = await page.$(`li[data-char-id="${char.id}"]`);
console.log('character row present before delete:', rowExistsBefore !== null);

await page.click(`li[data-char-id="${char.id}"] .btn-delete-character`);
await page.waitForTimeout(500);

const rowExistsAfter = await page.$(`li[data-char-id="${char.id}"]`);
console.log('character row present after delete (expect false):', rowExistsAfter !== null);

const charactersAfter = await fetch(`${BASE}/api/characters`).then((r) => r.json());
console.log('character still in API list (expect false):', charactersAfter.some((c) => c.id === char.id));

const itemsAfter = await fetch(`${BASE}/api/items?character_id=${char.id}`).then((r) => r.json());
console.log('items remaining for deleted character (expect 0):', itemsAfter.length);

await browser.close();
```

- [ ] **Step 5: Run it**

```bash
node .dev-tools/verify-character-delete.mjs
```

Expected output:
```
character row present before delete: true
character row present after delete (expect false): false
character still in API list (expect false): false
items remaining for deleted character (expect 0): 0
```

If any line doesn't match its `(expect ...)` annotation, stop and debug before continuing — a `true` on the "still in API list" line means the cascade delete or the route wiring from Task 1 has a bug that slipped through Task 1's own verification.

- [ ] **Step 6: Delete the throwaway script**

```bash
rm .dev-tools/verify-character-delete.mjs
```

- [ ] **Step 7: Commit**

```bash
git add public/settings.html
git commit -m "Add character management (delete, with cascade) to the settings page"
```

---

## Deploying this to the live cloud instance

Like the image-export feature, this plan changes only application code (`src/`, `public/`) — no schema, no new env vars, no migration. Once all three tasks are committed, redeploy the existing Vercel project the same way it was deployed before (`npx vercel --prod` from the repo root) to make both new features appear on the live cloud instance.
