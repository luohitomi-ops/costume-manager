# Friend Offline Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** package the existing Costume Manager app into a single Windows `.exe` that a non-technical friend can double-click, with zero Node.js install and no risk of the developer's real inventory data leaking into the friend's copy.

**Architecture:** `@yao-pkg/pkg` compiles the app's ESM source into a Windows executable. `better-sqlite3`'s compiled native binary (which pkg cannot embed in its snapshot) ships as a real folder next to the exe and is loaded from there at runtime via `createRequire` with an absolute path. The app detects whether it's running packaged (`process.pkg`) and, only in that mode, resolves its data directory relative to the exe's own location instead of the source tree, and auto-opens the user's default browser on startup.

**Tech Stack:** Node.js (ESM, `"type": "module"`), Express 4, better-sqlite3, `@yao-pkg/pkg` (actively maintained fork of vercel/pkg).

## Global Constraints

- No changes to the app's routes, models, or database schema/logic — this project is packaging only (per `docs/superpowers/specs/2026-07-18-distribution-and-access-design.md`, Project 1 section).
- The build must never include the developer's real `data/costume-manager.db` in the shipped package — a friend's first run must create a fresh, empty database.
- Target platform is Windows only (`node20-win-x64`) — the friends this ships to are on Windows.
- No code-signing — Windows SmartScreen's "unknown publisher" warning on first run is an accepted, out-of-scope limitation (see design doc's "Known friction" note).
- No test framework exists in this project (`node --test tests/` script exists but `tests/` is currently empty) — verification throughout this plan is manual: run real commands, run the real exe, inspect real output. This matches the project's existing convention (see `specs/003-category-management/plan.md`'s verification style).

## Important note on Task 1's build-tool risk

This plan was written after a live spike-test of `npx pkg src/server.js --targets node20-win-x64`. In the sandboxed environment the spike ran in, `pkg`'s download of its prebuilt base Node binary failed (network egress to GitHub release assets was blocked in that sandbox — confirmed separately by `curl` to `github.com` and `registry.npmjs.org` also returning nothing, while `npm install` itself succeeded through a different channel). `@yao-pkg/pkg`'s own documentation states it supports ESM projects, and it is the actively maintained fork specifically created to fix ESM gaps in the original `vercel/pkg`. **This has not been verified end-to-end on a real machine with normal internet access.** Task 1 below is written as a verification gate with a fully-specified fallback (Task 1b) in case the direct approach hits a genuine ESM incompatibility rather than the sandbox's network issue.

---

### Task 1: Configure pkg and verify it can package this ESM app

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: a working `dist/costume-manager.exe` that at minimum starts and logs `Costume Manager running at http://localhost:3000` (it is expected to then fail when a request hits the database, since native module loading isn't fixed until Task 2 — that specific failure mode is the success criterion for this task).

- [ ] **Step 1: Add `@yao-pkg/pkg` as a devDependency and configure it**

Run:
```bash
npm install --save-dev @yao-pkg/pkg
```

Edit `package.json` — add a `"pkg"` config block (top level, sibling to `"scripts"`) and a new script:

```json
  "scripts": {
    "dev": "node src/server.js",
    "start": "node src/server.js",
    "test": "node --test tests/",
    "build:css": "tailwindcss -i ./src/input.css -o ./public/style.css --minify",
    "watch:css": "tailwindcss -i ./src/input.css -o ./public/style.css --watch",
    "build:exe": "node scripts/build-exe.mjs"
  },
```

```json
  "pkg": {
    "assets": [
      "public/**/*",
      "src/db/schema.sql"
    ],
    "targets": [
      "node20-win-x64"
    ]
  },
```

(`build:exe` script referenced here is created in Task 4 — it's fine for the script file to not exist yet; this step only wires the config and the npm script name.)

- [ ] **Step 2: Attempt a direct build**

Run:
```bash
npx pkg . --output dist/costume-manager.exe
```

- [ ] **Step 3: Run the resulting exe and read its output**

Run (from a `cmd.exe` or PowerShell prompt, not Git Bash, since this is a native Windows exe):
```
dist\costume-manager.exe
```

Read whatever it prints, then stop the process (Ctrl+C).

**Decide based on what you see:**

- **If it prints `Costume Manager running at http://localhost:3000`** (even if it then errors or hangs when you open `localhost:3000` in a browser, because `better-sqlite3` isn't loadable yet) — **this task is done.** pkg successfully packaged the ESM app. Proceed to Step 4.
- **If it fails before printing that line**, with an error about import/require resolution, syntax, or ESM (not specifically a `better-sqlite3`/native-module error) — **stop here and do Task 1b below instead of Step 4**, then return to Task 2.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add pkg packaging config for Windows exe distribution"
```

---

### Task 1b: Fallback — esbuild pre-bundle (only if Task 1 Step 3 showed a genuine ESM incompatibility)

Skip this task entirely if Task 1 succeeded. Only do this if pkg could not run the ESM entry point at all.

**Files:**
- Create: `scripts/bundle.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add esbuild**

```bash
npm install --save-dev esbuild
```

- [ ] **Step 2: Write the bundle script**

Create `scripts/bundle.mjs`:

```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'build/bundle.cjs',
  external: ['better-sqlite3'],
});

console.log('Bundled to build/bundle.cjs');
```

- [ ] **Step 3: Update the pkg config to target the bundle instead of the ESM source**

In `package.json`, change `"pkg"`'s implicit entry: pkg reads `"main"` by default, so add an explicit `"bin"` field pointing at the bundle instead:

```json
  "bin": "build/bundle.cjs",
```

Also change `"assets"` paths in the `"pkg"` block: since the bundle now lives in `build/`, `schema.sql` needs to be reachable relative to `build/bundle.cjs`'s own `__dirname` at runtime. Copy it alongside the bundle in the bundle script instead of relying on the original `src/db/schema.sql` path:

```js
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('build', { recursive: true });
copyFileSync('src/db/schema.sql', 'build/schema.sql');

await build({
  entryPoints: ['src/server.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'build/bundle.cjs',
  external: ['better-sqlite3'],
});
```

Then in `src/db/connection.js`, the `schema.sql` read path (`path.join(__dirname, 'schema.sql')`) will resolve correctly on its own once bundled, because esbuild's CJS output keeps a single `__dirname` pointing at wherever the bundle file sits (`build/`), which is exactly where the copied `schema.sql` now also lives.

- [ ] **Step 4: Update `build:exe` npm script to bundle first**

```json
    "build:exe": "node scripts/bundle.mjs && node scripts/build-exe.mjs"
```

- [ ] **Step 5: Re-run Task 1's Steps 2-3 against the bundle**

```bash
node scripts/bundle.mjs
npx pkg . --output dist/costume-manager.exe
```
Then run `dist\costume-manager.exe` from PowerShell/cmd and confirm the same success criterion as Task 1 Step 3 (prints the "running at" line).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/bundle.mjs
git commit -m "Add esbuild pre-bundle step for pkg packaging"
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

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);
```

Leave everything from `migrateCategoriesTable(db);` (original line 20) onward in the file unchanged.

- [ ] **Step 2: Verify dev mode still works unchanged**

```bash
npm run dev
```
Expected: same as before this change — `Costume Manager running at http://localhost:3000`, and the app still serves your existing real data (check by opening `http://localhost:3000` in a browser and confirming your existing characters are still there). Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 3: Manually verify the packaged path — build, copy the native module by hand, run**

```bash
npx pkg . --output dist/costume-manager.exe
mkdir -p dist/native_modules
cp -r node_modules/better-sqlite3 dist/native_modules/better-sqlite3
```

Run from PowerShell/cmd:
```
cd dist
.\costume-manager.exe
```

Expected: prints `Costume Manager running at http://localhost:3000`, and this time opening `http://localhost:3000` in a browser shows a working (empty — no characters yet) Costume Manager UI, not an error. Confirm by registering a test character through the UI and seeing it appear.

Then check that `dist/data/costume-manager.db` was created (next to the exe, not anywhere in your source tree):
```bash
ls dist/data/
```
Expected: `costume-manager.db` (and its `-shm`/`-wal` files) present.

Stop the exe (Ctrl+C), then delete this manual test output so it doesn't get confused with Task 4's automated build later:
```bash
rm -rf dist
```

- [ ] **Step 4: Commit**

```bash
git add src/db/connection.js
git commit -m "Resolve better-sqlite3 and data directory relative to exe when packaged"
```

---

### Task 3: Auto-open the browser on launch when packaged

**Files:**
- Modify: `src/server.js:21-24`

**Interfaces:**
- Consumes: `process.pkg` (same detection flag as Task 2).

- [ ] **Step 1: Replace the `app.listen` block**

Replace lines 21-24:
```js
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Costume Manager running at http://localhost:${PORT}`);
});
```

with:

```js
import { exec } from 'node:child_process';

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`Costume Manager running at ${url}`);

  if (typeof process.pkg !== 'undefined') {
    exec(`start "" "${url}"`);
  }
});
```

(Add the `import { exec } from 'node:child_process';` line up near the other imports at the top of the file, not literally inline where shown above — keep the existing import block together for readability.)

- [ ] **Step 2: Verify dev mode is unaffected**

```bash
npm run dev
```
Expected: server starts, logs the URL, and — importantly — does **not** open a browser (since `process.pkg` is undefined outside a packaged exe). Confirm no browser window pops up. Stop the server (Ctrl+C).

- [ ] **Step 3: Verify packaged mode opens the browser**

```bash
npx pkg . --output dist/costume-manager.exe
mkdir -p dist/native_modules
cp -r node_modules/better-sqlite3 dist/native_modules/better-sqlite3
```

Run from PowerShell/cmd:
```
cd dist
.\costume-manager.exe
```
Expected: your default browser opens automatically to `http://localhost:3000` within a second or two of the process starting, showing the Costume Manager UI.

Stop the exe (Ctrl+C) and clean up:
```bash
rm -rf dist
```

- [ ] **Step 4: Commit**

```bash
git add src/server.js
git commit -m "Auto-open default browser on launch when running as a packaged exe"
```

---

### Task 4: Automated build script

**Files:**
- Create: `scripts/build-exe.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `dist/costume-manager.exe` and `dist/native_modules/better-sqlite3/` — the complete distributable folder, ready to zip. Never produces or touches `dist/data/` (that only gets created the first time a user, friend or developer, actually runs the exe).

- [ ] **Step 1: Add `dist/` to `.gitignore`**

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
```

Add a `dist/` line:
```
node_modules/
data/
*.log
.env*
.DS_Store
Thumbs.db
.dev-tools/*.png
.superpowers/
dist/
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

console.log('Building executable with pkg...');
execSync(`npx pkg . --output "${path.join(distDir, 'costume-manager.exe')}"`, {
  stdio: 'inherit',
  cwd: root,
});

console.log('Copying better-sqlite3 native module...');
const nativeModuleDest = path.join(distDir, 'native_modules', 'better-sqlite3');
fs.mkdirSync(path.dirname(nativeModuleDest), { recursive: true });
fs.cpSync(path.join(root, 'node_modules', 'better-sqlite3'), nativeModuleDest, {
  recursive: true,
});

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
Expected: `dist/costume-manager.exe` and `dist/native_modules/better-sqlite3/` (containing `package.json`, `build/Release/better_sqlite3.node`, etc.) — and no `dist/data/` yet (that only appears after first run).

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
2. A console window appears briefly and/or your default browser opens automatically to `http://localhost:3000`.
3. The Costume Manager UI loads and shows **zero characters** — a blank slate, not your real inventory.

- [ ] **Step 5: Confirm the app is fully functional from this blank state**

In the browser, register one test character (e.g. "測試角色") and one test item under it. Confirm it saves and appears in the list — proving the packaged exe can read and write its own database correctly, not just serve static pages.

- [ ] **Step 6: Confirm the database landed next to the exe, not elsewhere**

```bash
find /tmp/friend-machine-test -iname "*.db"
```
Expected: `/tmp/friend-machine-test/data/costume-manager.db` now exists.

- [ ] **Step 7: Clean up the simulation folder**

```bash
rm -rf /tmp/friend-machine-test
```

- [ ] **Step 8: Final commit (if anything changed during verification)**

If Steps 1-7 required no code changes (they shouldn't — this is a pure verification task), there is nothing to commit. If any issue was found and fixed along the way, commit that fix with a message describing what the friend-machine simulation caught.
