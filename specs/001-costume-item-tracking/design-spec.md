# Design Spec — 服裝道具管家 (locked values)

Fixed reference for the Korean-illustrated visual redesign. Do not deviate
from these without an explicit new instruction; when in doubt, match this
spec rather than guessing a new pixel value.

## Colors (DaisyUI custom theme `costume`)
- primary (forest green): `#3F5C46`
- primary content: `#FFFFFF`
- secondary/accent (amber): `#D98A4E`
- accent content: `#FFFFFF`
- base-100 (card bg): `#FBF8F1`
- base-200 (page bg): `#EFEAE0`
- base-300 (input/muted bg): `#F2ECDE`
- base content (text): `#37332C`
- neutral (muted text): `#8B8374`
- border/base-300 line: `#E4DBC5`
- stitched border accent: `#C9B78A`
- hue-character (sage): `#6E8F6B` / soft `#E7EEE2`
- hue-search (amber, = accent): `#D98A4E` / soft `#F6E2C9`
- hue-loadout (lavender): `#8779BE` / soft `#ECE7F7`

## Fixed sizes (do not vary per-component)
- Button height: **44px**, all buttons (primary + secondary)
- Input/select height: **44px**
- Icon size (card header icon glyphs): **24px**, uniform
- Card icon chip: 40px square, radius 12px
- Card radius: 26px; small radius (inputs/buttons/chips): 12px
- Container max-width: 1080px

## Background decoration images (assets/*.png)
- **Do not re-cut, regenerate, recompress, or resize-distort** any source
  PNG unless it genuinely has a baked-in white background — see below.
- Line-art assets (coser, sword, short-wig, long-wig, wand, costume) are
  provided **already transparent** by the user (verified: alpha channel
  present, 75-96% transparent pixels). Copy these **byte-for-byte**, never
  reprocess them — mix-blend-mode is unnecessary and was actively wrong
  (it re-darkens/greys already-correct alpha edges).
- Full-color illustrations (chest, scroll, logo) genuinely ship with a
  solid white/off-white background baked in (verified: alpha uniformly
  255, high color chroma vs. the line-art group). These need real alpha
  background removal — edge-connected flood-fill (not a global threshold,
  which would eat interior whites like the shirt icon inside the chest or
  the paper inside the scroll), plus premultiplied-alpha resizing to avoid
  white-fringe halos, plus color decontamination on the semi-transparent
  edge pixels. Script: see git history / scratchpad `debg3.py` pattern
  (`lineart()` vs `fullcolor()` — only ever run `fullcolor()` on chest/
  scroll/logo).
- All decoration images use `object-fit: contain` inside a fixed-size box
  matched to that image's own natural aspect ratio (read the file's actual
  width/height — never assign an arbitrary px width guessed by eye).
- Fixed anchor points, not stretched/filled, not cropped by an ancestor's
  `overflow: hidden` unless the crop is intentional (e.g. contained "in
  card" decorations which deliberately clip at the card edge).

## Asset placement (locked — confirmed against user's reference screenshot)
One small in-card accent per card (top-right corner, sits behind that
card's own form content, z-index 0), plus four page-level background
gutter bleeds that live outside any single card's box:

| Asset | Placement | Type |
|---|---|---|
| coser.png | Inside「新增角色」card, top-right, behind the form | in-card accent |
| chest.png | Inside「登記道具」card, top-right, overlapping the ribbon | in-card accent |
| wand.png | Inside「搜尋道具」card, top-right | in-card accent |
| scroll.png | Inside「角色完整清單」card, top-right | in-card accent |
| long-wig.png | Page background, top-right, near header/above the grid | gutter bleed |
| sword.png | Page background, left gutter between row 1 and row 2, diagonal | gutter bleed |
| short-wig.png | Page background, left gutter, left of sword | gutter bleed |
| costume.png | Page background, right gutter between「登記道具」and「角色完整清單」 | gutter bleed |
| logo.png | Replaces the「服裝道具管家」text title in the header | header |

Earlier attempts wrongly treated coser/wand as page-level gutter bleeds
(matching the literal repeated text instruction) which made them nearly
invisible or badly clipped — the user's reference screenshot is the
tie-breaker: it clearly shows one accent illustration living inside each
of the 4 cards, consistent with chest/scroll's placement.

## Layout rules
- Two-column CSS Grid (`grid-template-columns: 1fr 1fr`), **same-row cards
  share row height** (this is correct per the concept mockup — do not
  switch to independent-height columns).
- Column 1 (top→bottom): 新增角色, 搜尋道具.
- Column 2 (top→bottom): 登記道具 (featured/ribbon), 角色完整清單.
- Consistent top/bottom padding across all 4 cards.

## Implementation notes
- Stack: Tailwind CSS v4 + DaisyUI v5, **local build only** (no CDN — the
  project constitution forbids a runtime cloud dependency). Custom theme
  is named `costume`, defined in `src/input.css` via `@plugin "daisyui/theme"`.
- Source: `src/input.css` → build: `npm run build:css` → output:
  `public/style.css` (committed/generated locally, served as a static file).
- **After every edit to `public/index.html`'s classes, `public/style.css`
  must be rebuilt** (`npm run build:css`) or the new utility classes won't
  exist yet — Tailwind only emits CSS for classes it finds by scanning the
  HTML at build time. This bit us once this session (edited HTML, forgot
  to rebuild, verified against stale CSS).
- Original PNG assets live in
  `C:\Users\USER\Desktop\AI作品與素材庫\AI小工具\服裝道具管家` and are
  copied byte-for-byte into `public/assets/`. Never regenerate/resize them
  in this repo — see "Background decoration images" above.

## Verification workflow — use real screenshots, not DOM-math guessing
This session burned a lot of back-and-forth positioning things by computing
box-model math from `getBoundingClientRect()` numbers and never actually
*looking* at the render (the in-app browser tool's screenshot action was
unreliable). That produced repeated near-miss fixes the user had to catch
by eye each time. Fixed properly now — Playwright is a devDependency
(`npm install -D playwright` + `npx playwright install chromium`, already
done) with a reusable screenshot script at `.dev-tools/shot.mjs`:

```
node .dev-tools/shot.mjs <url> <output.png> <width> <height>
```

Then use the Read tool on the output PNG to actually see it. This is the
loop to use for ANY visual/layout change from now on:
1. Make the change, `npm run build:css`.
2. `node .dev-tools/shot.mjs http://localhost:3000 .dev-tools/full.png 1280 1350`
   (non-fullPage — fullPage mode double-renders `position: fixed` elements
   like the bottom nav, a screenshot artifact, not a real bug).
3. Read the PNG. Compare against the reference image/description directly.
4. For close-up checks (overlap, small icons), take a second screenshot
   with a tight `clip: {x,y,width,height}` — get the coordinates from
   Playwright's own `locator(sel).boundingBox()` first, not by eyeballing.
5. Also shoot at 390×900 (mobile) and 768×1000 (tablet) before calling a
   layout change done — a fix at one breakpoint can break another (e.g.
   in-card accents overlapping caption text only appeared at ≤640px).
6. `.dev-tools/*.png` is gitignored; the script itself is committed.

## Known-bad patterns to avoid (from prior regressions this session)
- `align-self: stretch` on buttons inside a flex row with a taller sibling
  makes them balloon to that sibling's full height — wrong. Buttons keep
  their fixed 44px height; align the row with `align-items: flex-end` and
  leave button `align-self` at its default/auto so it doesn't stretch.
- Negative `top`/`left` offsets on an element whose parent has
  `overflow: hidden` get silently clipped — check the parent's overflow
  before using negative insets for bleed effects.
- **CSS Grid's default `align-items: stretch` makes a short card in one
  column balloon to match a tall card in the other column** — this eats
  the exact whitespace the background gutter art (short-wig/sword) needs
  to live in. The grid MUST have `items-start` (Tailwind) /
  `align-items: start` so 新增角色 keeps its natural short height while
  登記道具 stays tall, leaving a real gap between it and 搜尋道具.
  (Same-row-height sync is still correct — 搜尋道具/角色完整清單 still
  start at the same Y because Grid rows share a start line regardless of
  `align-items`; only the *stretch-to-fill* behavior was wrong.)
- The page-level background bleed images (long-wig, short-wig, sword,
  costume) must bleed **outside** `.page`'s own box into the viewport's
  outer margin. That margin only exists once the viewport is wide enough
  that `.page` has actually hit its `max-width: 1080px` cap — below that
  (e.g. 1024–1279px) `.page` is still fluid-width and nearly fills the
  viewport, so any bleed causes real horizontal scroll. Show the
  background-decoration layer at `xl:` (1280px+), not `lg:` (1024px) —
  confirmed no scroll at 1024 (hidden) and 1280 (visible, images extend
  ~40px past `.page`'s edge into the margin with room to spare).
- COSER/寶箱/魔杖/卷軸 are **not** decorative-only — they intentionally
  overlap live content (COSER's bottom edge over the 角色名稱 input,
  chest over the ribbon). Don't add clearance padding to "protect" form
  fields from these unless the user reports actual illegible/covered
  text; the overlap is the intended look. Give them a *higher* z-index
  than the ribbon/header (z-20) so they paint on top of it, not behind.
- Source PNGs from the user can already be transparent (check with a
  script, not by eye) — always verify actual alpha channel stats before
  assuming a file needs de-backgrounding.

## 產出 UI 概念圖階段的規則（2026-07-12，避免像素對不準浪費時間）

這個專案光是「素材位置跟設計圖對齊」就花了好幾輪來回，事後檢討：核心問題是概念圖只是
一張沒有座標資訊的扁平 JPG，AI 只能肉眼在模糊圖上「猜」像素位置，猜錯了才發現，來回
猜好幾輪。真正讓後期修正變快的不是量測技巧進步，是使用者改成給「跟哪個元素切齊」
「蓋住多少」這種相對描述——這種話可以直接換算成精確座標，不用猜。**下次專案在「請 AI
產出 UI 概念圖」這個階段，就要注意以下幾點，才不會重蹈覆轍：**

1. **能出 Figma/Sketch 等原始檔就出**，不要只給扁平化的圖片——有圖層座標，AI 可以
   直接讀數字，不用估。沒有原始檔至少保留分層 PNG（不要先合併成一張）。
2. **請 AI 生成概念圖時，直接用最終要用的解析度/比例**（例如網頁就用 1280 寬去產圖），
   不要用隨便一個尺寸事後再換算比例——「換算比例」這一步就是這次一直對不準的根源
   （mockup 尺寸跟實際 build 出來的頁面比例不是線性關係，換算公式必然失真）。
3. **素材裁切要跟畫面設計同一輪決定**：每個裝飾用的 PNG 應該裁到剛好貼合可見圖案
   （不要留一堆透明留白的正方形畫布），不然 AI 之後很難判斷你要的視覺大小到底是多少
   （這次 coser/long-wig/sword 等素材都是方形大畫布、圖案本身只佔中間一小塊，導致
   物件框大小怎麼設都跟視覺直覺對不上）。
4. **概念圖裡不要有貼齊畫布邊緣被硬裁掉的元素**（例如頭髮流出畫面外）——AI 看不出
   「本來想露多少」，容易誤判成「應該要更大」。如果就是要出血效果，用文字寫清楚
   大概要露出多少（例如「往右邊出血約 40px」）。
5. **邊看概念圖邊口頭定規則，寫進規格文件**，像這次「右邊跟輸入框切齊」「蓋住卡片
   一半」這種相對於「頁面上其他真實元素」的具體描述——這些規則讓 AI 可以精確執行
   （用 DOM 元素的真實座標算），比讓它自己從一張圖片反推快很多也準很多。
6. **先講死技術限制，不要事後才發現衝突**：例如「不能有橫向捲軸」「要支援哪些寬度
   /斷點」，這次是先做完美觀比對，才發現跟「不能有橫向捲軸」的硬限制衝突，來回
   調整浪費時間。這類限制應該在還沒開始比對美觀之前就先講清楚。
