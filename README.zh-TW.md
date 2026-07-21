# 服裝道具管家

[English README](README.md) ｜ 沒寫過程式、旁邊沒有 AI 可以問？看 [完整安裝教學](安裝教學.md)（每一步都寫清楚，照著複製貼上就好）

給 coser 用的服裝道具庫存追蹤工具：把服裝、假髮、鞋子、道具登記在對應的角色底下，隨時查到每一件東西現在的狀態（收納在哪裡，或借給了誰）。

你的資料永遠只存在**你自己能控制的地方**——本地的一個檔案，或是你自己開的雲端資料庫帳號，沒有共用伺服器、沒有別人管理的帳號系統，也不會傳送任何東西給原作者。

有兩種跑法，挑一種適合你的：

## 方案 A：本地自架（最簡單）

```bash
npm install
npm run dev
```

伺服器會啟動在 `http://localhost:3000`，第一次執行時會自動建立
`data/costume-manager.db`。這個檔案就是全部的資料庫——要備份、搬移、
刪除都跟一般檔案一樣操作。不用帳號、不用連網、也不用密碼。

## 方案 B：部署你自己的雲端版

如果你想在手機上隨時查看/編輯庫存、不需要電腦開著，就用這個方案。
這會部署一份**只有你自己能控制**的私人版本——你會建立自己的免費資料庫、
自己設一組密碼，包括原作者在內，沒有任何人能碰到你的資料。

需要：一個 [Vercel](https://vercel.com) 帳號和一個 [Turso](https://turso.tech)
帳號（兩者都有免費方案）。

1. **複製環境變數範本並填入你的值：**
   ```bash
   cp .env.example .env.local
   ```
   建立一個 Turso 資料庫（用他們的 CLI 打 `turso db create`，或直接在
   他們的網頁後台建立），把 `TURSO_DATABASE_URL` 和 `TURSO_AUTH_TOKEN`
   填進 `.env.local`。`ACCESS_PASSWORD` 自己挑一組——這是唯一一組能
   進入你整個雲端版的密碼，設一個只有你自己知道的，而且不要把它寫進
   任何要提交到 git 的地方（`.env.local` 已經被 gitignore，預設是安全的）。

2. **建立資料庫schema**（一次性，只需要對一個全新的 Turso 資料庫跑一次）：
   ```bash
   node scripts/setup-turso-schema.mjs
   ```

3. **（選用）把現有的本地資料搬過去。** 如果你已經在用方案 A 一段時間，
   想把現有的庫存資料一起帶到雲端版，而不是從空的開始：
   ```bash
   node scripts/migrate-to-turso.mjs
   ```
   如果 Turso 資料庫裡已經有資料了，這個腳本會拒絕執行——它是設計給
   一次性搬遷用的，不是重複同步。

4. **部署到 Vercel：**
   ```bash
   npx vercel link
   npx vercel env add TURSO_DATABASE_URL production
   npx vercel env add TURSO_AUTH_TOKEN production
   npx vercel env add ACCESS_PASSWORD production
   npx vercel env add DB_DRIVER production   # 輸入：turso
   npx vercel --prod
   ```
   打開部署好的網址，輸入你的 `ACCESS_PASSWORD` 就能進去了。

5. **（選用）設定自動備份。** Turso 本身很少弄丟資料，但多一層保障總是好的：
   ```bash
   node scripts/backup-turso.mjs
   ```
   會把 characters/items/categories/lenses 全部匯出成一份帶時間戳記的 JSON，存在
   `backups/`（自動只保留最新 20 份）。想排程自動跑，Windows 用工作排程器、Mac 用
   `crontab`（各自的完整步驟見[安裝教學.md](安裝教學.md)第 10 步）。

   救援時先跑一次不帶 `--confirm` 的乾跑模式確認內容，沒問題再加上 `--confirm` 真的寫回去：
   ```bash
   node scripts/restore-turso.mjs             # 預演，不會真的寫入
   node scripts/restore-turso.mjs --confirm   # 真的還原
   ```
   備份檔只存在本機，不會自動同步到任何雲端，想要異地備援要自己另外處理。

**這個方案不包含：** 多人帳號、忘記密碼重設、或本地版跟雲端版之間的
自動同步——兩者只能挑一個當作你目前真正在用的那一份。

## API

完整的 API 端點說明在
[specs/001-costume-item-tracking/contracts/api.md](specs/001-costume-item-tracking/contracts/api.md)。

## 專案文件

這個專案是用 [Spec Kit](https://github.com/github/spec-kit) 的 spec-driven
流程開發的。`.specify/memory/constitution.md` 是專案原則，
`specs/001-costume-item-tracking/` 有完整的 spec、plan 跟任務拆解。
