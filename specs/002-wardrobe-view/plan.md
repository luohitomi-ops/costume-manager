# 穿衣櫃頁面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一個獨立的「我的穿衣櫃」頁面（`public/wardrobe.html`），不分角色手風琴瀏覽
全部登記過的服裝道具，支援分類/狀態/關鍵字篩選，純瀏覽不可編輯。

**Architecture:** 純 HTML + vanilla JS（無框架、無建置步驟），跟 `public/index.html` 同
模式，共用同一份 `public/style.css`。新增 `public/shared.js` 承接兩頁共用的
`CATEGORY_LABELS`/`itemToLine()`。後端只新增一個 query 參數（`status`）給既有的
`GET /api/items`，不新增 API 端點。

**Tech Stack:** Express 4、better-sqlite3、Tailwind CSS v4 + DaisyUI v5（本地 build）、
Playwright（`.dev-tools/shot.mjs`，開發期截圖驗證用）。

## Global Constraints

- 這個專案**沒有 git**（`git status` 顯示 not a git repository）——每個任務結尾**不要**
  跑 `git commit`，改成用 `npm run build:css` + 手動截圖/curl 驗證做為完成checkpoint。
- 改完 `public/*.html` 的 class 後一定要 `npm run build:css`，否則新 class 不會生效
  （這個專案的已知地雷，見 `../001-costume-item-tracking/design-spec.md`）。
- 純瀏覽頁面，不可以出現編輯/刪除/改狀態的按鈕或表單。
- 不新增測試框架；用現有 `curl` + Playwright 截圖驗證，不寫 `node --test` 測試檔
  （design.md 已明確排除這輪加測試框架）。
- 顏色/字體/卡片圓角等視覺 token 一律沿用 `../001-costume-item-tracking/design-spec.md`
  列出的既有數值，不要另外發明新的顏色或間距。
- 不放線稿裝飾 PNG（`assets/*.png` 那些）在 wardrobe.html 上。

---

## Task 1: 後端 — `GET /api/items` 支援 `status` 篩選

**Files:**
- Modify: `src/models/item.js:69-91`（`searchItems` 函式）
- Modify: `src/routes/items.js:16-25`（`GET /` route）

**Interfaces:**
- Consumes: 無（沿用既有 `searchItems`/`GET /api/items`）
- Produces: `searchItems({ q, category, character_id, status, include_inactive })`——
  之後的任務（wardrobe.html 的 fetch 邏輯）會用 `GET /api/items?status=xxx` 這個 query
  參數。

- [ ] **Step 1: 修改 `src/models/item.js` 的 `searchItems`**

把整個函式改成：

```js
export function searchItems({ q, category, character_id, status, include_inactive } = {}) {
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
  return db.prepare(`SELECT * FROM items ${where} ORDER BY name`).all(params);
}
```

（只新增了 `status` 參數跟對應的 `if (status)` 區塊，其他不變。）

- [ ] **Step 2: 修改 `src/routes/items.js` 的 `GET /`**

把 route handler 改成：

```js
router.get('/', (req, res) => {
  const { q, category, character_id, status, include_inactive } = req.query;
  res.json(
    searchItems({
      q,
      category,
      character_id,
      status,
      include_inactive: include_inactive === 'true',
    })
  );
});
```

- [ ] **Step 3: 啟動伺服器並驗證**

Run: `npm run dev`（或如果已經在跑，跳過；確認 `http://localhost:3000` 有回應）

驗證沒加 status 時行為不變：

```bash
curl -s http://localhost:3000/api/items | head -c 300
```

Expected: 回傳 JSON 陣列，內容跟修改前一樣（不受影響）。

驗證 status 篩選真的生效（用你資料庫裡實際存在的一筆道具的 status，例如
`in_storage`）：

```bash
curl -s "http://localhost:3000/api/items?status=in_storage"
```

Expected: 只回傳 `status` 欄位等於 `in_storage` 的道具。再測一個不存在的 status
（例如 `status=lent_out`，如果目前沒有任何道具是這個狀態）：

```bash
curl -s "http://localhost:3000/api/items?status=lent_out"
```

Expected: 回傳 `[]`（空陣列，不是錯誤）。

---

## Task 2: 抽出共用的 `public/shared.js`，`index.html` 改用它

**Files:**
- Create: `public/shared.js`
- Modify: `public/index.html:199-333`（移除重複定義，改成引用 `shared.js`）

**Interfaces:**
- Produces: 全域函式 `itemToLine(item)`（回傳一段 `<li>...</li>` HTML 字串）、
  全域常數 `CATEGORY_LABELS`（`{ costume, wig, shoes, prop, lens, other }` 六個 key
  對應中文標籤）。後面的任務（wardrobe.html）會直接用這兩個名字。

- [ ] **Step 1: 建立 `public/shared.js`**

```js
const CATEGORY_LABELS = { costume: '服裝', wig: '假髮', shoes: '鞋子', prop: '道具', lens: '隱眼', other: '其他' };

function itemToLine(item) {
  const isLent = item.status === 'lent_out';
  const where = item.status === 'in_storage'
    ? `收納於：${item.location}`
    : isLent
      ? `借給：${item.borrower}`
      : '尚未指定位置';
  return `
    <li class="flex items-center justify-between gap-3 flex-wrap px-3 py-2 text-sm rounded-xl" style="background:#F2ECDE;border:1px solid #E4DBC5">
      <span>
        <span class="category-tag inline-block text-xs font-semibold px-2 py-0.5 rounded-full" style="background:#F6E2C9;color:#D98A4E">${CATEGORY_LABELS[item.category] || item.category}</span>
        ${item.name}
      </span>
      <span class="status-line text-sm ${isLent ? 'lent font-semibold' : ''}" style="color:${isLent ? '#D98A4E' : '#8B8374'}">${where}</span>
    </li>
  `;
}
```

（跟原本 `index.html` 裡的定義逐字相同，只是搬到獨立檔案。）

- [ ] **Step 2: 在 `public/index.html` 加入 `<script src="shared.js">`**

找到這行（在 `</nav>` 之後、`<style>` 之前一段的 `<script>` 開始處）：

```html
<script>
const CATEGORY_LABELS = { costume: '服裝', wig: '假髮', shoes: '鞋子', prop: '道具', lens: '隱眼', other: '其他' };
```

改成：

```html
<script src="shared.js"></script>
<script>
```

（也就是：刪掉 `const CATEGORY_LABELS = ...` 這一行，改成在 `<script>` 標籤前多插入
一行 `<script src="shared.js"></script>`。）

- [ ] **Step 3: 刪掉 `index.html` 裡重複的 `itemToLine` 定義**

在同一個 `<script>` 區塊最後面，找到並整段刪除：

```js
function itemToLine(item) {
  const isLent = item.status === 'lent_out';
  const where = item.status === 'in_storage'
    ? `收納於：${item.location}`
    : isLent
      ? `借給：${item.borrower}`
      : '尚未指定位置';
  return `
    <li class="flex items-center justify-between gap-3 flex-wrap px-3 py-2 text-sm rounded-xl" style="background:#F2ECDE;border:1px solid #E4DBC5">
      <span>
        <span class="category-tag inline-block text-xs font-semibold px-2 py-0.5 rounded-full" style="background:#F6E2C9;color:#D98A4E">${CATEGORY_LABELS[item.category] || item.category}</span>
        ${item.name}
      </span>
      <span class="status-line text-sm ${isLent ? 'lent font-semibold' : ''}" style="color:${isLent ? '#D98A4E' : '#8B8374'}">${where}</span>
    </li>
  `;
}
```

（`itemToLine` 現在由 `shared.js` 提供，`renderList()` 呼叫它的地方不用改，JS 全域函式
不分檔案。）

- [ ] **Step 4: 重新 build CSS 並驗證首頁功能沒壞**

Run: `npm run build:css`

用 Playwright 驗證搜尋功能（依賴 `itemToLine`）還能正常運作：

```bash
cat > .dev-tools/verify_shared.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await page.fill('#search-q', '');
await page.click('#search-form button[type=submit]');
await page.waitForTimeout(300);
const resultHtml = await page.$eval('#search-results', (el) => el.innerHTML);
console.log('pageErrors:', errors.length, errors.join('; '));
console.log('hasResultContent:', resultHtml.length > 0);
await browser.close();
EOF
node .dev-tools/verify_shared.mjs
rm .dev-tools/verify_shared.mjs
```

Expected: `pageErrors: 0`（`shared.js` 有被正確載入，`itemToLine`/`CATEGORY_LABELS`
沒有變成 undefined 導致 JS 錯誤），`hasResultContent: true`。

---

## Task 3: 建立 `public/wardrobe.html` 頁面骨架 + 底部導覽串接

**Files:**
- Create: `public/wardrobe.html`
- Modify: `public/index.html:172-175`（`nav-wardrobe` 按鈕）
- Modify: `public/index.html:319-322`（移除 `nav-wardrobe` 的 click 事件監聽）

**Interfaces:**
- Consumes: `public/style.css`（既有 build 產物）、`public/shared.js`（Task 2 產出）
- Produces: `public/wardrobe.html` 裡的 DOM id：`#filter-category`、`#filter-status`、
  `#filter-q`、`#wardrobe-list`、`#wardrobe-error`——Task 4 的 JS 會操作這些 id。

- [ ] **Step 1: 建立 `public/wardrobe.html`**

```html
<!DOCTYPE html>
<html lang="zh-Hant" data-theme="costume">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>我的穿衣櫃 · 服裝道具管家</title>
<link rel="stylesheet" href="style.css">
</head>
<body class="bg-base-200 text-base-content font-sans m-0">
<div class="relative max-w-[1080px] mx-auto px-5 py-8 pb-26">

  <header class="text-center mb-8">
    <h1 class="text-2xl font-bold m-0">我的穿衣櫃</h1>
    <p class="text-[0.95rem] mt-2" style="color:#8B8374">依角色分區瀏覽所有登記過的服裝道具。</p>
  </header>

  <section class="card relative bg-base-100 shadow-md p-6 mb-6" style="border:1px solid #E4DBC5;border-radius:1.625rem">
    <div class="flex flex-wrap gap-4">
      <div class="flex-1" style="min-width:140px">
        <label for="filter-category" class="block text-sm mb-1" style="color:#8B8374">分類</label>
        <select id="filter-category" class="select w-full h-11 min-h-0" style="background:#F2ECDE;border-color:#E4DBC5">
          <option value="">全部分類</option>
          <option value="costume">服裝</option>
          <option value="wig">假髮</option>
          <option value="shoes">鞋子</option>
          <option value="prop">道具</option>
          <option value="lens">隱眼</option>
          <option value="other">其他</option>
        </select>
      </div>
      <div class="flex-1" style="min-width:140px">
        <label for="filter-status" class="block text-sm mb-1" style="color:#8B8374">狀態</label>
        <select id="filter-status" class="select w-full h-11 min-h-0" style="background:#F2ECDE;border-color:#E4DBC5">
          <option value="">全部狀態</option>
          <option value="unassigned">尚未指定位置</option>
          <option value="in_storage">收納中</option>
          <option value="lent_out">已借出</option>
        </select>
      </div>
      <div class="flex-1" style="min-width:180px">
        <label for="filter-q" class="block text-sm mb-1" style="color:#8B8374">關鍵字</label>
        <input type="text" id="filter-q" placeholder="輸入道具名稱搜尋" class="input w-full h-11 min-h-0" style="background:#F2ECDE;border-color:#E4DBC5">
      </div>
    </div>
  </section>

  <div id="wardrobe-list" class="flex flex-col gap-4"></div>
  <p id="wardrobe-error" class="text-sm text-center py-3 hidden" style="color:#8B8374;border:1px dashed #E4DBC5;border-radius:0.75rem">資料載入失敗，請重新整理頁面。</p>

</div>

<nav class="fixed left-0 right-0 bottom-0 z-20 flex justify-center gap-8 bg-base-100 px-4 py-2 shadow-[0_-4px_16px_rgba(55,51,44,0.06)]" style="border-top:1px solid #E4DBC5" aria-label="主要導覽">
  <a href="index.html" class="nav-item flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-home">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/></svg>
    <span>首頁</span>
  </a>
  <a href="wardrobe.html" class="nav-item is-active flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-wardrobe">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M8 7h8l3 4v9H5v-9l3-4Z"/><path d="M5 13h14"/></svg>
    <span>我的穿衣櫃</span>
  </a>
  <button type="button" class="nav-item is-disabled flex flex-col items-center gap-1 px-3 py-1 text-xs opacity-45 cursor-not-allowed" id="nav-settings" disabled title="即將推出">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.5 7.5 0 0 0 0-3l2-1.5-2-3.5-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.4 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.4-1-2 3.5 2 1.5a7.5 7.5 0 0 0 0 3l-2 1.5 2 3.5 2.4-1c.8.65 1.66 1.16 2.6 1.5L10 22h4l.4-2.5c.94-.34 1.8-.85 2.6-1.5l2.4 1 2-3.5-2-1.5Z"/></svg>
    <span>設置</span>
  </button>
</nav>

<style>
  .nav-item.is-active { color: #3F5C46; }
  .nav-item:not(.is-active) { color: #8B8374; }
</style>

<script src="shared.js"></script>
<script>
</script>
</body>
</html>
```

（`<script>` 內容留空，下個任務會補上。這個檔案的 nav 跟 `index.html` 的 nav 標記幾乎
一樣，差別只在：`nav-home`/`nav-wardrobe` 都改成真的 `<a href>`、`nav-wardrobe` 帶
`is-active`。）

- [ ] **Step 2: 修改 `public/index.html` 的底部導覽，讓「首頁」「我的穿衣櫃」都變成真的連結**

把現有的：

```html
<button type="button" class="nav-item is-active flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-home">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/></svg>
    <span>首頁</span>
  </button>
  <button type="button" class="nav-item flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-wardrobe">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M8 7h8l3 4v9H5v-9l3-4Z"/><path d="M5 13h14"/></svg>
    <span>我的穿衣櫃</span>
  </button>
```

改成：

```html
<a href="index.html" class="nav-item is-active flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-home">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h4v-6h2v6h4a1 1 0 0 0 1-1v-9"/></svg>
    <span>首頁</span>
  </a>
  <a href="wardrobe.html" class="nav-item flex flex-col items-center gap-1 px-3 py-1 text-xs" id="nav-wardrobe">
    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M8 7h8l3 4v9H5v-9l3-4Z"/><path d="M5 13h14"/></svg>
    <span>我的穿衣櫃</span>
  </a>
```

- [ ] **Step 3: 移除 `index.html` 裡 `nav-wardrobe` 的舊 click 事件監聽**

找到並整段刪除（`nav-wardrobe` 現在是真連結，不需要 JS 手動捲動了）：

```js
document.getElementById('nav-wardrobe').addEventListener('click', () => {
  document.querySelector('.card--loadout').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveNav('nav-wardrobe');
});
```

保留 `nav-home` 那段（`window.scrollTo` + `setActiveNav('nav-home')`）不動——首頁
內部仍然需要「點首頁 icon 捲回頂端」這個行為，因為使用者可能人在首頁往下捲動時點它。

- [ ] **Step 4: Build CSS 並驗證兩頁互相導航**

Run: `npm run build:css`

```bash
cat > .dev-tools/verify_nav.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle' });
await page.click('#nav-wardrobe');
await page.waitForLoadState('networkidle');
console.log('after nav-wardrobe click, url:', page.url());
await page.click('#nav-home');
await page.waitForLoadState('networkidle');
console.log('after nav-home click, url:', page.url());
await browser.close();
EOF
node .dev-tools/verify_nav.mjs
rm .dev-tools/verify_nav.mjs
```

Expected: 第一行印出 URL 結尾是 `wardrobe.html`，第二行印出 URL 結尾是 `index.html`。

用 `node .dev-tools/shot.mjs http://localhost:3000/wardrobe.html .dev-tools/wardrobe_shell.png 1280 900`
截圖，用 Read 工具看過一次，確認：標題「我的穿衣櫃」、三個篩選欄位、底部導覽列都正常
顯示，`我的穿衣櫃` nav item 是綠色（`is-active`）。看完刪掉這張截圖
（`rm .dev-tools/wardrobe_shell.png`）。

---

## Task 4: 手風琴清單渲染 + 篩選邏輯

**Files:**
- Modify: `public/wardrobe.html`（補上 `<script>` 內容）

**Interfaces:**
- Consumes: `itemToLine(item)`、`CATEGORY_LABELS`（`shared.js`，Task 2）、
  `GET /api/characters`、`GET /api/items?category=&status=&q=`（Task 1）
- Produces: 無（頁面內部邏輯，沒有其他任務依賴這裡的函式名）

- [ ] **Step 1: 在 `public/wardrobe.html` 的空 `<script>` 標籤內補上邏輯**

把：

```html
<script src="shared.js"></script>
<script>
</script>
```

改成：

```html
<script src="shared.js"></script>
<script>
let allCharacters = [];
let currentItemsByChar = new Map();
const expandedIds = new Set();

async function fetchCharacters() {
  const res = await fetch('/api/characters');
  if (!res.ok) throw new Error('characters fetch failed');
  return res.json();
}

async function fetchItems(filters) {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.status) params.set('status', filters.status);
  if (filters.q) params.set('q', filters.q);
  const res = await fetch('/api/items?' + params.toString());
  if (!res.ok) throw new Error('items fetch failed');
  return res.json();
}

function groupByCharacter(items) {
  const map = new Map();
  for (const item of items) {
    if (!map.has(item.character_id)) map.set(item.character_id, []);
    map.get(item.character_id).push(item);
  }
  return map;
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
          ${items.map(itemToLine).join('')}
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

async function refreshItems() {
  const errorEl = document.getElementById('wardrobe-error');
  try {
    const items = await fetchItems({
      category: document.getElementById('filter-category').value,
      status: document.getElementById('filter-status').value,
      q: document.getElementById('filter-q').value,
    });
    currentItemsByChar = groupByCharacter(items);
    errorEl.classList.add('hidden');
    renderWardrobe();
  } catch (err) {
    errorEl.classList.remove('hidden');
  }
}

let debounceTimer;
function debounceRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refreshItems, 300);
}

document.getElementById('filter-category').addEventListener('change', refreshItems);
document.getElementById('filter-status').addEventListener('change', refreshItems);
document.getElementById('filter-q').addEventListener('input', debounceRefresh);

(async function init() {
  const errorEl = document.getElementById('wardrobe-error');
  try {
    allCharacters = await fetchCharacters();
    await refreshItems();
  } catch (err) {
    errorEl.classList.remove('hidden');
  }
})();
</script>
```

- [ ] **Step 2: Build CSS**

Run: `npm run build:css`

（這個任務沒有新增 Tailwind class 到 wardrobe.html 以外的地方，但保險起見還是重跑一次，
確保 wardrobe.html Task 3 用到的 class 都已經涵蓋在 build 產物裡。）

- [ ] **Step 3: 用 Playwright 驗證手風琴展開/收合**

```bash
cat > .dev-tools/verify_accordion.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000/wardrobe.html', { waitUntil: 'networkidle' });
const sectionCount = await page.$$eval('#wardrobe-list > section', (els) => els.length);
console.log('character sections rendered:', sectionCount);

const firstToggle = await page.$('.wardrobe-char-toggle');
const beforeHidden = await page.evaluate((btn) => btn.nextElementSibling.classList.contains('hidden'), firstToggle);
await firstToggle.click();
await page.waitForTimeout(100);
const afterHidden = await page.evaluate((btn) => btn.nextElementSibling.classList.contains('hidden'), firstToggle);
console.log('before click hidden:', beforeHidden, '-> after click hidden:', afterHidden);
await browser.close();
EOF
node .dev-tools/verify_accordion.mjs
rm .dev-tools/verify_accordion.mjs
```

Expected: `character sections rendered:` 是一個大於 0 的數字（等於你資料庫裡「有道具」
的角色數，不是全部角色數，因為沒道具的角色不顯示）；`before click hidden: true ->
after click hidden: false`（點擊後從收合變展開）。

- [ ] **Step 4: 用 Playwright 驗證三種篩選都真的把清單縮小**

```bash
cat > .dev-tools/verify_filters.mjs << 'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://localhost:3000/wardrobe.html', { waitUntil: 'networkidle' });

async function countSections() {
  return page.$$eval('#wardrobe-list > section', (els) => els.length);
}

const baseline = await countSections();

// category filter: pick a category that should exclude at least one existing item
await page.selectOption('#filter-category', 'shoes');
await page.waitForTimeout(200);
const afterCategory = await countSections();

await page.selectOption('#filter-category', '');
await page.selectOption('#filter-status', 'lent_out');
await page.waitForTimeout(200);
const afterStatus = await countSections();

await page.selectOption('#filter-status', '');
await page.fill('#filter-q', 'zzz-should-not-match-anything-zzz');
await page.waitForTimeout(500);
const afterKeyword = await page.$eval('#wardrobe-list', (el) => el.textContent.includes('沒有符合條件的道具'));

console.log('baseline sections:', baseline);
console.log('after category=shoes:', afterCategory);
console.log('after status=lent_out:', afterStatus);
console.log('after nonsense keyword shows empty state:', afterKeyword);
await browser.close();
EOF
node .dev-tools/verify_filters.mjs
rm .dev-tools/verify_filters.mjs
```

Expected: `after nonsense keyword shows empty state: true`（篩選一個不可能存在的關鍵字，
畫面要顯示「沒有符合條件的道具」，不是報錯或維持舊資料）。`afterCategory`/
`afterStatus` 的數字依你資料庫實際內容而定，只要不等於 `baseline` 就代表篩選真的有把
API 請求換了條件（如果剛好相等也沒關係，只要確認上面 curl 那組驗證過 API 本身有正確
篩選就好，這裡主要是驗證「篩選事件有觸發 refetch」）。

---

## Self-Review Notes

- Spec coverage：design.md 的「架構」「資料流」「互動細節」「共用程式」「錯誤處理」
  「範圍外」六個段落，分別對應 Task 3（架構/骨架)、Task 1+4（資料流)、Task 4（互動
  細節：手風琴+篩選)、Task 2（共用程式)、Task 4 Step 1 內的 try/catch + `#wardrobe-
  error`（錯誤處理)。「範圍外」的四項（編輯/角色頭像/分類管理/Excel匯出等）這個
  plan 完全沒有觸碰，符合設計。
- Placeholder scan：無 TBD/TODO，每個 Step 都有完整可貼上執行的程式碼跟指令。
- Type/命名一致性：`CATEGORY_LABELS`、`itemToLine`、`character_id`、`status` 等命名
  跨 Task 1/2/4 一致，跟現有 `index.html`/`items.js`/`item.js` 的既有命名也一致，沒有
  另外發明新名字。
