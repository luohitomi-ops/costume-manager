# Design — 設置頁面：分類管理

日期：2026-07-12　狀態：已核准，待寫實作計畫

## 目的

「設置」目前是底部導覽一個灰色不能點的佔位按鈕。這輪把它變成真的可以點、導向一個新的
`public/settings.html` 頁面，第一個功能是分類管理：新增、改名、刪除、調整順序。

現有 6 個分類（服裝/假髮/鞋子/道具/隱眼/其他）目前寫死在三個地方（`src/models/item.js`
的 `CATEGORIES` 陣列、`src/db/schema.sql` 的 CHECK 限制、`public/index.html`/
`public/wardrobe.html`/`public/shared.js` 各自的 HTML/JS)。這輪要把分類變成真正的資料，
三個消費端都改成動態讀取，而不是繼續複製六份寫死清單。

**範圍決定**：原本 6 個內建分類跟使用者自己新增的分類，管理權限完全平等——都能改名、
刪除（有道具在用就擋)、調整順序。不特別保護內建分類。

## 資料模型

新增資料表：

```sql
CREATE TABLE categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0
);
```

- `slug` 是內部識別碼，永遠不變（例如 `costume`、或新增分類時自動產生的
  `custom_<timestamp>`），使用者不會看到也不需要輸入。
- `name` 是顯示用中文名稱，改名只改這欄。
- `sort_order` 決定所有下拉選單裡分類出現的先後順序。
- `is_builtin` 純粹用來標記原始 6 個分類（種子資料用），不影響任何管理權限——設計上
  跟自訂分類享有完全相同的操作。
- 圖示不存進資料庫：內建 6 個分類的手畫 SVG 圖示留在前端程式碼裡、用 `slug` 對照；
  新增的自訂分類一律套用同一個固定的通用圖示。
- `items.category` 拿掉原本的 `CHECK (category IN (...))` 寫死清單限制（分類會變動，
  不能再寫死列舉)。刪除分類時「還有道具在用就不能刪」這條規則改成在應用層（Node
  程式碼)查詢 `items` 表確認，不是資料庫層級的約束。

## 後端 API

新增 `src/models/category.js`、`src/routes/categories.js`：

| 動作 | Endpoint | 說明 |
|---|---|---|
| 列出全部 | `GET /api/categories` | 依 `sort_order` 排序回傳 `[{slug,name,sort_order,is_builtin}]` |
| 新增 | `POST /api/categories` `{name}` | 自動產生 slug（`custom_` + 當下時間戳），`sort_order` 排在最後一筆之後 |
| 改名 | `PATCH /api/categories/:slug` `{name}` | 只更新 `name` |
| 調整順序 | `POST /api/categories/:slug/move` `{direction: 'up'\|'down'}` | 跟相鄰一筆（依 `sort_order`)交換順序值；已經是第一筆時 `up` 無效果，已經是最後一筆時 `down` 無效果 |
| 刪除 | `DELETE /api/categories/:slug` | 先查 `SELECT COUNT(*) FROM items WHERE category = ?`（不管 `active` 欄位為何，只要有任何一筆引用就算）；數量 > 0 回 409 + 訊息「還有 N 件道具使用這個分類，無法刪除」；等於 0 才真的刪除該筆 |

`src/models/item.js` 的 `createItem()` 驗證邏輯：`CATEGORIES` 寫死陣列拿掉，改成查
`categories` 表確認傳入的 `category` slug 存在。

## 前端串接

- **`public/shared.js`**：拿掉寫死的 `CATEGORY_LABELS` 物件。`itemToLine(item)` 改簽名成
  `itemToLine(item, categoryLabels)`，由呼叫端（`index.html`/`wardrobe.html`)在頁面
  載入時打一次 `GET /api/categories`、組成 `{slug: name}` 物件後傳入。
- **`public/index.html`**「登記服裝道具」卡片的分類自訂下拉選單：現在 6 個 `<li>`
  選項是寫死在 HTML 裡的，改成頁面載入時抓 `GET /api/categories` 動態產生選項列表。
  圖示邏輯：`slug` 命中內建 6 個之一就用原本手畫 SVG（維持現有視覺不變)，其餘一律用
  固定的通用圖示（複用跟「道具」類似風格的簡單線稿圖示)。
- **`public/wardrobe.html`** 的 `#filter-category` 原生 `<select>`：一樣改成動態抓
  `GET /api/categories` 產生 `<option>`，不再是寫死的 6 個。

## 設置頁面（`public/settings.html`）

- 底部導覽「設置」從灰色 `disabled` 按鈕改成真的 `<a href="settings.html">` 連結
  （跟先前「我的穿衣櫃」同樣做法），`index.html`/`wardrobe.html`/`settings.html`
  三個頁面的底部導覽列都要同步更新（新增 `settings.html` 自己的 `is-active`）。
- 頁面主體：一個分類清單卡片，每一列顯示：圖示 + 名稱 + 上/下箭頭按鈕（調順序，第一筆
  沒有「上」、最後一筆沒有「下」)+ 改名按鈕（點了原地變成輸入框，Enter/blur 送出
  `PATCH`)+ 刪除按鈕。
- 刪除按鈕點擊後，如果後端回 409，用跟現有 `#wardrobe-error` 同樣的提示樣式顯示錯誤
  訊息（「還有 N 件道具使用這個分類，無法刪除」)，不做彈窗（沿用專案一貫風格)。
- 清單最下方一個「新增分類」的輸入框 + 按鈕，輸入名稱、送出後打 `POST`、重新整理清單。
- 排序用上/下箭頭按鈕，不做拖曳排序（專案目前是純 vanilla JS、無框架、無額外套件，
  拖曳排序需要額外處理滑鼠/觸控事件，箭頭按鈕功能等價且實作簡單很多，符合這個專案
  一貫的極簡風格)。
- 純瀏覽以外的頁面（這頁本身就是管理功能，不是純瀏覽頁），但沒有道具的新增/編輯功能，
  範圍只限分類本身的 CRUD。

## 資料庫遷移

沿用專案已有的自動遷移模式（`src/db/connection.js`，跟先前新增隱眼/其他分類時
`migrateItemsCategoryCheck` 同一套手法）：伺服器啟動時偵測 `categories` 表是否存在，
不存在的話：
1. 建立 `categories` 表
2. 種入 6 筆內建分類（`slug`/`name`/`sort_order` 依現在 服裝→假髮→鞋子→道具→隱眼→其他
   的順序，`is_builtin=1`）
3. 用「重建表格搬資料」的安全做法（`ALTER TABLE items RENAME TO items_old` → 建立新
   `items`（拿掉 CHECK)→ `INSERT INTO items SELECT * FROM items_old` → `DROP TABLE
   items_old`）拿掉 `items.category` 的舊 CHECK 限制，真實道具資料原封不動搬過去

## 錯誤處理

- 前端三個地方（`index.html`/`wardrobe.html`/`settings.html`)如果 `GET /api/categories`
  打不到，顯示文字提示（比照現有 `#wardrobe-error` 樣式），不彈窗。
- 刪除衝突（409)見上方「設置頁面」段落。

## 測試

不新增測試框架；用 curl 驗證新增的 5 個 API endpoint，用 Playwright 驗證設置頁面的
新增/改名/排序/刪除互動，以及 `index.html`/`wardrobe.html` 的分類下拉選單改成動態抓取
後行為不變（沿用專案這一貫的驗證方式)。

## 範圍外（明確不做，這輪之後再排）

- Excel 匯出
- 分享唯讀連結給其他人看
- 家用電腦 + 外出手機都能連（目前只能同 WiFi 區網存取；已知的低成本中間方案是
  Tailscale，之後排）
- 開源分享給其他 COSER 自己架設用（GitHub repo 已經可行，之後要補：雙擊啟動捷徑
  `.bat`/`.exe`，讓不熟終端機的人也能用；README 安裝教學也要一併補強)
- 共用登入的線上多人版本（需要帳號系統 + 每人資料互相隔離 + 實際租主機，估算每月
  至少 $5-10 美金主機費 + 一輪不小的開發量，之後有需求再獨立排一輪設計)
- 手機版跟電腦版介面一致——目前手機瀏覽器打開已經是同一份響應式網頁（不是兩套UI)，
  只要能連到伺服器，畫面本來就跟電腦版同源同步；這點如果之後選擇「開源自架」或
  「線上版」都不需要額外處理，只有「同網域內能連到」本身是待解決的問題（見上面
  Tailscale/雲端兩項)
