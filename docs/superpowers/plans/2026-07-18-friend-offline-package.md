# Friend Offline Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** package the existing Costume Manager app into a single Windows `.exe` that a non-technical friend can double-click, with zero Node.js install and no risk of the developer's real inventory data leaking into the friend's copy.

**Architecture:** `esbuild` bundles the app's ESM source into a single self-contained CJS file first (this is required — see "Verified findings" below, direct `pkg` packaging of this ESM codebase does not work safely). `@yao-pkg/pkg` then compiles that single bundle into a Windows executable. Nothing except the app's own JS logic lives inside the pkg snapshot: `better-sqlite3`'s native binary, the `public/` static assets, and `schema.sql` all ship as real files/folders copied next to the `.exe` at build time, and are loaded from there at runtime via a shared `baseDir` computed from `process.execPath`. The app detects packaged mode via `process.pkg` and auto-opens the user's default browser on startup only in that mode.

**Tech Stack:** Node.js (ESM, `"type": "module"`), Express 4, better-sqlite3, esbuild, `@yao-pkg/pkg` (actively maintained fork of vercel/pkg).

## Global Constraints

- No changes to the app's routes, models, or database schema/logic — this project is packaging only (per `docs/superpowers/specs/2026-07-18-distribution-and-access-design.md`, Project 1 section). Changes to *where* `connection.js` and `server.js` read static files/schema from (real disk next to the exe, vs. the source tree) are in scope — that's packaging plumbing, not business logic.
- The build must never include the developer's real `data/costume-manager.db` in the shipped package — a friend's first run must create a fresh, empty database.
- Target platform is Windows only, targeting `node22-win-x64` (see "Verified findings" — `node20`/`node18` have no prebuilt pkg binary and silently trigger a from-source Node build, which fails without a full MSVC toolchain).
- No code-signing — Windows SmartScreen's "unknown publisher" warning on first run is an accepted, out-of-scope limitation (see design doc's "Known friction" note).
- No test framework exists in this project (`node --test tests/` script exists but `tests/` is currently empty) — verification throughout this plan is manual: run real commands, run the real exe, inspect real output. This matches the project's existing convention (see `specs/003-category-management/plan.md`'s verification style).
- **Every manual exe test in this plan must run from a folder with no real project files anywhere in its parent chain** (e.g. under `/tmp/`, never inside `costume-manager/` or a worktree of it). See the safety incident below for why this is a hard rule, not a suggestion.

## Verified findings (read before starting Task 1)

Two rounds of live spike-testing were done against this exact codebase before writing this plan:

1. **`node20-win-x64` and `node18-win-x64` have no prebuilt binary in pkg's current release cache.** `npx pkg ... --targets node20-win-x64` returns a 404 from the binary cache and silently falls back to compiling Node from source, which requires a full Windows build toolchain (`vcbuild.bat`, MSVC) and fails without it. Querying `https://api.github.com/repos/yao-pkg/pkg-fetch/releases/tags/v3.6` directly confirmed the only Windows x64 binaries currently published are for Node 22, 24, and 26. **Use `node22-win-x64`.**

2. **Direct `pkg` packaging of this ESM codebase is unsafe, not just unsupported.** With a working `node22-win-x64` binary, `npx pkg src/server.js` did produce an exe, but printed `Failed to generate V8 bytecode for src/server.js` / `src/db/connection.js` and fell back to "plain source" mode. Running the resulting exe revealed that fallback isn't self-contained: Windows' process list showed the running server was actually `C:\Program Files\nodejs\node.exe` — **the packaged exe silently shelled out to the real, globally-installed Node.exe on the build machine** rather than running standalone. Because of that fallback, `__dirname`-relative path resolution behaved like an ordinary unpackaged script, and the test process ended up reading the developer's **real** database (`data/costume-manager.db`, 3 real characters) via ordinary relative-path navigation from wherever it was actually invoked — even though the test was intended to be an isolated check. The process was killed immediately and the real data was confirmed unmodified (read-only query, `better-sqlite3` WAL-mode connection touches journal files but not row data).
   - This is unacceptable for two independent reasons: a friend's machine has no Node.js installed at all (the entire point of packaging), so this fallback would just crash there instead of "working by accident" the way it did on the dev machine — and the fallback's real-path resolution is exactly the mechanism that leaked real data during testing.
   - **Fix: bundle with esbuild to a single CJS file first (Task 1), so pkg only ever has to snapshot one already-resolved CommonJS file** — this avoids the ESM bytecode-compilation failure entirely, and Task 1 includes an explicit check that the shipped exe never depends on a real Node.exe being present.

---

### Task 1: esbuild bundle + pkg packaging, verified standalone

**Files:**
- Create: `scripts/bundle.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `build/bundle.cjs` (single self-contained CJS bundle, `better-sqlite3` left as an unresolved `require('better-sqlite3')` call — deliberately not bundled, since it's a native module; Task 2 makes that resolvable when packaged) and `build/schema.sql` (copy, so the bundle's `__dirname`-relative read of `schema.sql` keeps working post-bundle — same directory depth as the original `src/db/schema.sql` relative to `src/db/connection.js`).
- Consumes: `src/server.js` as the sole entry point (its `import` graph pulls in the rest of `src/` automatically via bundling).

- [ ] **Step 1: Add esbuild and `@yao-pkg/pkg` as devDependencies**

```bash
npm install --save-dev esbuild @yao-pkg/pkg
```

- [ ] **Step 2: Write the bundle script**

Create `scripts/bundle.mjs`:

```js
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('build', { recursive: true });
copyFileSync('src/db/schema.sql', 'build/schema.sql');

await build({
  entryPoints: ['src/server.js'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'build/bundle.cjs',
  external: ['better-sqlite3'],
});

console.log('Bundled to build/bundle.cjs');
```

- [ ] **Step 3: Add `pkg` config and build scripts to `package.json`**

Add to `"scripts"`:
```json
    "bundle": "node scripts/bundle.mjs",
    "build:exe": "node scripts/bundle.mjs && node scripts/build-exe.mjs"
```

(`build:exe`'s second step, `scripts/build-exe.mjs`, is created in Task 4 — fine for it not to exist yet.)

Add a top-level `"pkg"` block:
```json
  "pkg": {
    "targets": [
      "node22-win-x64"
    ]
  }
```

- [ ] **Step 4: Bundle and package**

```bash
npm run bundle
mkdir -p /tmp/task1-verify
npx pkg build/bundle.cjs --output /tmp/task1-verify/costume-manager.exe
```

- [ ] **Step 5: Verify the exe is standalone — no bytecode warnings, no real-Node fallback**

Check the output of Step 4 for the `Failed to generate V8 bytecode` warning seen during spike-testing. Expected now: **no such warning** — bundling to a single CJS file avoids the ESM compilation path that produced it. If the warning still appears, stop and report BLOCKED (this would mean the bundle itself contains something pkg can't compile — read the file it names and report back).

Run the exe from a clean folder with nothing else in it (this is the isolation rule from Global Constraints — `/tmp/task1-verify/` qualifies, the source tree does not):

From PowerShell/cmd (not Git Bash — this is a native Windows exe):
```
cd \tmp\task1-verify
.\costume-manager.exe
```

Expected: prints `Costume Manager running at http://localhost:3000`. It's expected to then be unusable for anything touching the database (better-sqlite3 isn't resolvable yet — Task 2 fixes that) — that specific failure is fine and expected here.

**While it's running**, in a separate PowerShell/cmd window, confirm it is NOT shelling out to a real Node.exe:
```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$conn | ForEach-Object { (Get-Process -Id $_.OwningProcess).Path }
```
Expected: the printed path is `...\task1-verify\costume-manager.exe` itself — **not** `C:\Program Files\nodejs\node.exe` or any other real Node install path. If it prints a real Node.exe path, stop and report BLOCKED — it means the bundle still isn't fully self-contained and the safety issue from spike-testing is still present.

Stop the exe (Ctrl+C in its window), then delete the verification folder:
```bash
rm -rf /tmp/task1-verify
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/bundle.mjs
git commit -m "Add esbuild pre-bundle and pkg config for standalone Windows exe packaging"
```

---

### Task 2: Make the database connection packaging-aware

**Files:**
- Modify: `src/db/connection.js:1-18`

**Interfaces:**
- Produces: `db` (default export, unchanged shape — still a `better-sqlite3` `Database` instance) — every model file (`src/models/character.js`, `src/models/item.js`, `src/models/category.js`) imports this unchanged.
- Consumes: `process.pkg` (set by the pkg runtime when running inside a packaged exe, `undefined` otherwise — this is pkg's documented detection flag) and `process.execPath` (absolute path to the running exe itself, standard Node API).

- [ ] **Step 1: Replace the top of `src/db/connection.js`**

Replace lines 1-18 (from `import Database from 'better-sqlite3';` through the `db.exec(schema);` line) with:

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');

const Database = isPackaged
  ? require(path.join(baseDir, 'native_modules', 'better-sqlite3'))
  : require('better-sqlite3');

const dataDir = path.join(baseDir, 'data');
const dbPath = path.join(dataDir, 'costume-manager.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const schemaPath = isPackaged ? path.join(baseDir, 'db', 'schema.sql') : path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');
db.exec(schema);
```

Leave everything from `migrateCategoriesTable(db);` (original line 20) onward in the file unchanged.

Note on `schemaPath`: in dev mode this is unchanged from before (`src/db/schema.sql`, via `__dirname`). In packaged mode it reads from `<exe folder>/db/schema.sql` — Task 4's build script copies `build/schema.sql` (created by Task 1's bundle script) to that location. `better-sqlite3` is a native addon and cannot be embedded in pkg's snapshot at all — that's the whole reason for the `native_modules` copy-next-to-exe pattern.

- [ ] **Step 2: Verify dev mode still works unchanged**

```bash
npm run dev
```
Expected: same as before this change — `Costume Manager running at http://localhost:3000`, and the app still serves your existing real data (check by opening `http://localhost:3000` in a browser and confirming your existing characters are still there). Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 3: Manually verify the packaged path end-to-end, from an isolated folder**

```bash
npm run bundle
mkdir -p /tmp/task2-verify
npx pkg build/bundle.cjs --output /tmp/task2-verify/costume-manager.exe
mkdir -p /tmp/task2-verify/native_modules
cp -r node_modules/better-sqlite3 /tmp/task2-verify/native_modules/better-sqlite3
mkdir -p /tmp/task2-verify/db
cp build/schema.sql /tmp/task2-verify/db/schema.sql
```

Run from PowerShell/cmd:
```
cd \tmp\task2-verify
.\costume-manager.exe
```

Expected: prints `Costume Manager running at http://localhost:3000`. Opening `http://localhost:3000` in a browser now shows a working, **empty** (no characters — this folder has never had a `data/` dir) Costume Manager UI, not an error.

Confirm by registering a test character through the UI (e.g. "測試角色") and seeing it appear — proves the packaged exe can both read and write its own database.

Then check the database landed in the isolated test folder, not anywhere near the real project:
```bash
find /tmp/task2-verify/data -iname "*.db"
```
Expected: `/tmp/task2-verify/data/costume-manager.db` present.

Stop the exe (Ctrl+C) and clean up:
```bash
rm -rf /tmp/task2-verify
```

- [ ] **Step 4: Commit**

```bash
git add src/db/connection.js
git commit -m "Resolve better-sqlite3, data directory, and schema.sql relative to exe when packaged"
```

---

### Task 3: Serve static assets and auto-open the browser when packaged

**Files:**
- Modify: `src/server.js`

**Interfaces:**
- Consumes: `process.pkg` / `process.execPath` (same detection pattern as Task 2).

- [ ] **Step 1: Replace the full file**

Current `src/server.js`:
```js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db/connection.js';
import charactersRouter from './routes/characters.js';
import itemsRouter from './routes/items.js';
import exportRouter from './routes/export.js';
import categoriesRouter from './routes/categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/characters', charactersRouter);
app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api', exportRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Costume Manager running at http://localhost:${PORT}`);
});

export default app;
```

Replace it with:
```js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import './db/connection.js';
import charactersRouter from './routes/characters.js';
import itemsRouter from './routes/items.js';
import exportRouter from './routes/export.js';
import categoriesRouter from './routes/categories.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isPackaged = typeof process.pkg !== 'undefined';
const baseDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');

const app = express();
app.use(express.json());
app.use(express.static(path.join(baseDir, 'public')));

app.use('/api/characters', charactersRouter);
app.use('/api/items', itemsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api', exportRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Costume Manager running at ${url}`);

  if (isPackaged) {
    exec(`start "" "${url}"`);
  }
});

export default app;
```

Note: `baseDir` in dev mode (`path.join(__dirname, '..')`, i.e. project root) resolves to the exact same `public/` directory the original `path.join(__dirname, '..', 'public')` did — this is a no-op change in dev mode, only packaged mode behaves differently.

- [ ] **Step 2: Verify dev mode is unaffected**

```bash
npm run dev
```
Expected: server starts, logs the URL, serves the UI at `http://localhost:3000` exactly as before, and — importantly — does **not** open a browser window (since `process.pkg` is undefined outside a packaged exe). Stop the server (Ctrl+C).

- [ ] **Step 3: Verify packaged mode serves static assets and opens the browser, from an isolated folder**

```bash
npm run bundle
mkdir -p /tmp/task3-verify
npx pkg build/bundle.cjs --output /tmp/task3-verify/costume-manager.exe
mkdir -p /tmp/task3-verify/native_modules
cp -r node_modules/better-sqlite3 /tmp/task3-verify/native_modules/better-sqlite3
mkdir -p /tmp/task3-verify/db
cp build/schema.sql /tmp/task3-verify/db/schema.sql
cp -r public /tmp/task3-verify/public
```

Run from PowerShell/cmd:
```
cd \tmp\task3-verify
.\costume-manager.exe
```
Expected: your default browser opens automatically to `http://localhost:3000` within a second or two, showing the full styled Costume Manager UI (confirms `public/style.css` and other static assets are being served correctly from the copied folder, not 404ing).

Stop the exe (Ctrl+C) and clean up:
```bash
rm -rf /tmp/task3-verify
```

- [ ] **Step 4: Commit**

```bash
git add src/server.js
git commit -m "Serve public/ from exe-relative path and auto-open browser when packaged"
```

---

### Task 4: Automated build script

**Files:**
- Create: `scripts/build-exe.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `build/bundle.cjs` and `build/schema.sql` (produced by Task 1's `scripts/bundle.mjs`, which `build:exe` runs first).
- Produces: `dist/costume-manager.exe`, `dist/native_modules/better-sqlite3/`, `dist/db/schema.sql`, `dist/public/` — the complete distributable folder, ready to zip. Never produces or touches `dist/data/` (that only gets created the first time a user, friend or developer, actually runs the exe).

- [ ] **Step 1: Add `dist/` and `build/` to `.gitignore`**

Current `.gitignore`:
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
```

Add `dist/` and `build/` lines:
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

- [ ] **Step 2: Write the build script**

Create `scripts/build-exe.mjs`:

```js
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');

console.log('Cleaning dist/...');
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

console.log('Packaging bundle with pkg...');
execSync(
  `npx pkg build/bundle.cjs --output "${path.join(distDir, 'costume-manager.exe')}"`,
  { stdio: 'inherit', cwd: root }
);

console.log('Copying better-sqlite3 native module...');
const nativeModuleDest = path.join(distDir, 'native_modules', 'better-sqlite3');
fs.mkdirSync(path.dirname(nativeModuleDest), { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'better-sqlite3'), nativeModuleDest, {
  recursive: true,
});

console.log('Copying schema.sql...');
fs.mkdirSync(path.join(distDir, 'db'), { recursive: true });
fs.copyFileSync(path.join(root, 'build', 'schema.sql'), path.join(distDir, 'db', 'schema.sql'));

console.log('Copying public/ assets...');
fs.cpSync(path.join(root, 'public'), path.join(distDir, 'public'), { recursive: true });

console.log('');
console.log(`Done. Distributable folder: ${distDir}`);
console.log('Zip the dist/ folder to share it with a friend.');
console.log('data/ was intentionally not included — first run creates a fresh, empty database.');
```

- [ ] **Step 3: Run the full build via the npm script**

```bash
npm run build:exe
```

Expected output ends with:
```
Done. Distributable folder: <path>\dist
Zip the dist/ folder to share it with a friend.
data/ was intentionally not included — first run creates a fresh, empty database.
```

Confirm the folder contents:
```bash
find dist -maxdepth 2
```
Expected: `dist/costume-manager.exe`, `dist/native_modules/better-sqlite3/`, `dist/db/schema.sql`, `dist/public/` (containing `index.html`, `style.css`, etc.) — and no `dist/data/` yet (that only appears after first run).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-exe.mjs .gitignore
git commit -m "Add automated build script for the friend distributable package"
```

---

### Task 5: End-to-end friend-machine simulation

This task has no code changes — it's the final verification that everything from Tasks 1-4 works together the way an actual friend would experience it.

**Files:** none (verification only)

- [ ] **Step 1: Build fresh**

```bash
npm run build:exe
```

- [ ] **Step 2: Copy the dist folder somewhere that simulates "a friend's computer"**

This must be a location with no relation to the source tree at all (per the Global Constraints isolation rule):
```bash
cp -r dist /tmp/friend-machine-test
```

- [ ] **Step 3: Confirm no trace of your real data is present**

```bash
find /tmp/friend-machine-test -iname "*.db"
```
Expected: no output (no `.db` file exists yet — it's created on first run, not shipped).

- [ ] **Step 4: Double-click the exe (from Windows Explorer, not this shell)**

Navigate to the `friend-machine-test` folder in Windows Explorer and double-click `costume-manager.exe`.

Expected, in order:
1. Windows may show a SmartScreen "Windows protected your PC" warning (expected — the exe is unsigned). Click "More info" then "Run anyway."
2. Your default browser opens automatically to `http://localhost:3000`, showing the fully styled Costume Manager UI.
3. The UI shows **zero characters** — a blank slate, not your real inventory.

- [ ] **Step 5: Confirm the exe is not depending on a real Node.exe**

While it's running, in PowerShell:
```powershell
$conn = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
$conn | ForEach-Object { (Get-Process -Id $_.OwningProcess).Path }
```
Expected: path points at `...\friend-machine-test\costume-manager.exe` itself, not any real Node.exe install. (This repeats Task 1's check as a final end-to-end confirmation, now with all four pieces — native module, schema, public assets, browser auto-open — assembled together by the real build script rather than manually.)

- [ ] **Step 6: Confirm the app is fully functional from this blank state**

In the browser, register one test character (e.g. "測試角色") and one test item under it. Confirm it saves and appears in the list.

- [ ] **Step 7: Confirm the database landed next to the exe, not elsewhere**

```bash
find /tmp/friend-machine-test -iname "*.db"
```
Expected: `/tmp/friend-machine-test/data/costume-manager.db` now exists.

- [ ] **Step 8: Clean up the simulation folder**

```bash
rm -rf /tmp/friend-machine-test
```

- [ ] **Step 9: Final commit (if anything changed during verification)**

If Steps 1-8 required no code changes (they shouldn't — this is a pure verification task), there is nothing to commit. If any issue was found and fixed along the way, commit that fix with a message describing what the friend-machine simulation caught.
