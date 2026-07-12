# Design — 穿衣櫃頁面（我的穿衣櫃）

日期：2026-07-12　狀態：已核准，待寫實作計畫

## 目的

底部導覽「我的穿衣櫃」目前只是捲動到首頁的「角色完整清單」卡片，且必須先選一個角色
才能看清單。這輪把它做成一個獨立的瀏覽頁面：不用先選角色，直接看到「每個角色 + 底下
所有道具」的手風琴清單，並支援分類/狀態/關鍵字篩選。純瀏覽用途，編輯/新增/刪除仍然
留在首頁的表單。

## 架構

新增一個獨立靜態頁面 `public/wardrobe.html`，跟 `public/index.html` 同一套模式：純
HTML + vanilla JS（無框架、無額外建置步驟），共用同一份 `public/style.css`（Tailwind
build 輸出，不用另外跑一次 build，因為 class 都已經涵蓋在同一份 CSS 裡——如果用到
`index.html` 沒出現過的新 class，要記得 `npm run build:css` 補進去，這是這個專案已知的
地雷，見 `../001-costume-item-tracking/design-spec.md`）。

底部導覽列（`index.html` 跟 `wardrobe.html` 都要有，維持一致）：
- 「我的穿衣櫃」從現在的 `scrollIntoView` 改成 `<a href="wardrobe.html">` 真的導頁
- `wardrobe.html` 上「首頁」按鈕導回 `index.html`
- `wardrobe.html` 自己的「我的穿衣櫃」nav item 顯示 `is-active` 狀態

視覺風格延用首頁的卡片樣式（`bg-base-100`、圓角、`#E4DBC5` 邊框、同一套顏色變數），
**但不放 `08 Skills` 那些線稿裝飾 PNG**——這頁是功能性瀏覽頁，不需要裝飾。

## 資料流

沿用現有 API，只新增一個小欄位支援：

1. 頁面載入時平行打 `GET /api/characters` 跟 `GET /api/items`（不帶 filter，拿全部
   active 道具），前端用 `character_id` 把 items 分組成 `Map<characterId, items[]>`。
2. 篩選列變動時（分類下拉、狀態下拉、關鍵字輸入，三個都能同時套用），改打
   `GET /api/items?category=...&status=...&q=...` 帶上目前選的條件重新抓一次，
   前端一樣照 `character_id` 分組重繪。
3. 分類/狀態下拉的選項來源跟 `index.html` 的「登記服裝道具」表單共用同一份清單
   （服裝/假髮/鞋子/道具/隱眼/其他 六類；狀態三種），避免以後改分類要兩邊維護。
4. `src/models/item.js` 的 `searchItems()` 目前只吃 `q`/`category`/`character_id`，
   這輪加上 `status`（跟 `category` 同寫法，`WHERE status = @status`），
   `src/routes/items.js` 的 `GET /` 對應加讀 `req.query.status`。

## 互動細節

- 手風琴：每個角色一個區塊（頭像用文字姓名即可，不用另外做圖），預設全部收合，
  點標題展開/收合；**允許同時展開多個**，不強制一次只能開一個。
- 每個角色標題列顯示「角色名稱 + 道具數量」（例如「絕區零-維琳娜（3)」），方便不展開
  也能看出誰東西多。
- 篩選（分類/狀態/關鍵字）套用後：
  - 角色底下完全沒有符合條件的道具 → 該角色的手風琴整塊不顯示（不留空殼)
  - 有符合的 → 只顯示符合條件的道具，數量顯示篩選後的數字
- 篩選輸入框（關鍵字)用 debounce（比照專案其他地方的習慣，約 300ms）避免每個按鍵都打
  API。
- 道具列的呈現沿用 `index.html` 既有的 `itemToLine()` 樣式（分類標籤 + 名稱 + 狀態/
  收納位置或借出對象），這段邏輯目前寫死在 `index.html` 的 `<script>` 裡，這輪抽成
  兩個頁面都能用的共用寫法（見下方「共用程式」）。
- 純瀏覽：不出現編輯/刪除/改狀態的按鈕。

## 共用程式

`itemToLine()` 、`CATEGORY_LABELS` 這兩個目前寫死在 `index.html` 的 inline
`<script>` 裡，`wardrobe.html` 也需要一樣的邏輯。抽成 `public/shared.js`（純 JS，無
模組打包工具，用 `<script src="shared.js">` 各自引入），把這兩個搬過去，
`index.html`／`wardrobe.html` 都改成引用它，避免以後分類新增/改名要改兩個地方
（分類清單本來就已經因為這次新增隱眼/其他而暴露出「要改兩處」的風險，這輪順手收斂)。

## 錯誤處理

API 失敗（fetch reject 或非 2xx）時，篩選列下方顯示一行文字提示（比照 `index.html`
现有的 `empty` 提示樣式，dashed 邊框），不另外設計彈窗或 toast。

## 測試

專案目前沒有前端測試框架，只有 `node --test` 跑後端。這輪比照現有慣例：
`src/models/item.js` 新增的 `status` 篩選邏輯如果專案之後補測試，可以加在既有
`tests/`（目前是空的，不在這輪範圍內新增測試框架，避免範圍擴大）。

## 範圍外（明確不做）

- 編輯/刪除/改狀態（留在首頁表單)
- 角色頭像圖片
- 分類管理、Excel 匯出、分享連結、雲端同步（下一輪個別規劃)
