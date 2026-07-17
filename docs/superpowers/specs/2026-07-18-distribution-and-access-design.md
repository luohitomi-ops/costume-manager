# Costume Manager — Distribution & Access Design

Date: 2026-07-18
Status: Approved by user, pending implementation plan

## Context

Costume Manager (self-hostable cosplay costume/prop inventory tracker,
Express + better-sqlite3 + vanilla HTML/Tailwind/DaisyUI frontend) has a
working core: register characters, register costumes/wigs/shoes/props
against a character, track status (in storage / lent out / unassigned),
manage user-defined categories. It currently runs as `npm run dev` on
`http://localhost:3000`, single instance, no accounts, real user data
already live in `data/costume-manager.db`.

This design covers four independent follow-on projects that came out of
one brainstorming session. They share a codebase but ship to different
audiences with different constraints. Each can be implemented and shipped
on its own; none blocks the others except where noted under
"Shared prerequisite" below.

| # | Project | Audience | Ships as |
|---|---|---|---|
| 1 | Friend Offline Package | A few non-technical coser friends | Downloadable `.exe` + support folder, zero install |
| 2 | Inventory Image Export | The user herself | New button in the existing app |
| 3 | Cloud Personal Instance | The user herself (phone, no PC) | Vercel deployment, password-protected |
| 4 | Public Open-Source Release | Technical/AI-assisted friends | Public GitHub repo |

## Shared prerequisite: swappable data layer (needed by Project 3 only)

Project 1 packages the app exactly as it runs today — fully offline
against a local SQLite file — and needs no changes to the data layer at
all. Project 3 needs the same route/business logic to also run against a
cloud database reachable from Vercel's serverless functions, where a local
SQLite file is not usable persistently. The adapter below exists solely to
make that possible without maintaining two copies of the model/route code.

`better-sqlite3`'s API is synchronous (`db.prepare(...).get()/.run()/.all()`
called directly, no `await`, used throughout `src/models/*.js` and
`src/routes/*.js`). The chosen cloud database, **Turso** (SQLite-compatible,
free tier, chosen over a paid always-on host in the brainstorm), is only
reachable over the network via `@libsql/client`, whose calls are all
**async** (`await db.execute(...)`).

This means Project 3 is not a one-line connection swap. It requires:

1. A small adapter module (`src/db/adapter.js`) exposing `get/all/run`
   methods, with two implementations:
   - `local.js` — wraps the existing `better-sqlite3` instance, methods
     stay synchronous internally but return values wrapped in
     `Promise.resolve(...)` so callers can uniformly `await`.
   - `turso.js` — wraps `@libsql/client`, genuinely async.
   - Selected at startup via an environment variable (e.g. `DB_DRIVER=local`
     vs `DB_DRIVER=turso`), read once in `src/db/connection.js`.
2. Every function in `src/models/character.js`, `src/models/item.js`,
   `src/models/category.js` becomes `async` and every internal call site
   gets an `await`.
3. Every route handler in `src/routes/*.js` that calls a model function
   becomes `async` and awaits it (Express 4 supports async handlers as
   long as errors are caught and passed to `next()`; existing handlers
   need a try/catch or an async-wrapper helper added).
4. `migrateCategoriesTable` / `migrateItemsCategoryCheckRemoval` in
   `src/db/connection.js` (schema setup/migration on boot) only need to
   run under the `local` driver — Turso's schema will be created once via
   a one-time setup script (see Project 3 below), not on every boot.

This is real refactor work — the biggest single piece of effort across all
four projects — not a config change. Projects 1, 2, and 4 do not require
this adapter to ship; only Project 3 does. Project 1 can therefore ship
before Project 3 without waiting on it.

## Project 1: Friend Offline Package

**Goal:** a coser friend with no technical background downloads one file,
double-clicks it, and is looking at a blank Costume Manager in their
browser — no Node.js install, no terminal.

**Approach:** [`pkg`](https://github.com/vercel/pkg) compiles the app
(using the `local` data-layer driver — no adapter changes needed for this
project) plus the Node runtime into a single Windows `.exe`. `better-sqlite3`
is a native addon (a compiled `.node` file) which `pkg` cannot embed inside
the snapshot; it is instead copied to a folder placed next to the `.exe`
at build time, and loaded from disk at runtime — pkg's standard pattern for
native modules.

**Build output:** a zip containing `costume-manager.exe` and a
`native_modules/` support folder. The user unzips, double-clicks the exe,
the process starts the existing Express server on `localhost:3000` and
opens the user's default browser to that URL automatically (a small
addition to `src/server.js`'s startup, gated so it only fires in the
packaged build, not in `npm run dev`).

**Data isolation:** the build script explicitly excludes the existing
`data/` directory from the package. First run on the friend's machine
creates a fresh empty `data/costume-manager.db` next to the exe (existing
`connection.js` behavior, unchanged) — no manual "clear the database"
step, no risk of the user's real data leaking into a friend's copy.

**Known friction (accepted, not fixed this round):** the `.exe` is
unsigned, so Windows SmartScreen will show an "unknown publisher" warning
on first run. Friends need to click "Run anyway." Code-signing is out of
scope.

## Project 2: Inventory Image Export

**Goal:** the user can generate a nicely formatted image of her current
full inventory and send it to a friend over LINE/Messenger, without a
live link or hosting.

**Approach:** a new print-styled HTML view (grouped by character, item
name/category/status/location, same DaisyUI visual language as the rest
of the app) rendered at a new route, e.g. `GET /export/image-preview`.
A new API endpoint, e.g. `GET /api/export/image`, uses **Playwright**
(already a devDependency, already used by `.dev-tools/shot.mjs` for this
exact kind of screenshot) to render that view headlessly and return a PNG
as a file download.

**UI entry point:** a "下載圖片" button on `index.html` (confirmed
placement — not on `wardrobe.html`) that hits the new endpoint and
triggers a browser download.

**Scope note:** this is local-only, works identically whether the user is
running the plain local dev server or (after Project 3 ships) the cloud
instance — no dependency on Project 1 or 3.

## Project 3: Cloud Personal Instance

**Goal:** the user can view and edit her own inventory from her phone from
anywhere, without her PC needing to be on — including scenarios where she
only has her phone with her, no computer at all.

**Approach:**
- Deploy to **Vercel** (the user already has an active Vercel project/
  account — `your-other-vercel-project`), using the `turso` driver from the shared
  data-layer adapter described above.
- Provision a free-tier **Turso** database; run a one-time schema-creation
  script (adapted from `src/db/schema.sql` + the two migration functions
  in `connection.js`, run once manually against Turso rather than on every
  boot) plus a one-time **data migration script** that reads every row out
  of the user's existing local `data/costume-manager.db` (characters,
  items, categories) and inserts them into Turso, so her real inventory
  carries over — this is not a fresh start.
- Add a minimal password gate: a single shared secret stored as a Vercel
  environment variable (`ACCESS_PASSWORD`), checked via a simple Express
  middleware on all routes (session cookie after one correct entry, no
  user accounts, no password reset flow — single-user by design).
- **After this ships, the user's own daily usage moves entirely to the
  Vercel URL** (confirmed: she will stop using `localhost:3000` day to day,
  both at home and away — one source of truth, not synced copies). The
  local dev server remains only as the codebase's `local` driver mode,
  which Projects 1 and 4 still depend on.

**Explicitly not built:** multi-user accounts, password reset/recovery
flow, real-time sync between any local copy and the cloud copy (there is
only one live copy after migration — this isn't a sync problem).

## Project 4: Public Open-Source Release

**Goal:** a technically-capable cosplayer (or one getting AI help) can find
the project publicly, clone it, and run it themselves.

**Approach:**
- Push the existing local git history to a new public GitHub repository.
  **Actually pushing is a publish action and will be confirmed with the
  user at implementation time, not assumed from this design's approval.**
- Verified already: `data/` has been in `.gitignore` since the initial
  commit and no personal data file has ever been tracked or appears in
  git history — safe to make the repo public as-is on that front.
- Light README pass: add explicit framing ("self-hosted, your data never
  leaves your computer, no account/cloud required") near the top, confirm
  Node.js version prerequisite is stated, keep the existing
  install/run instructions (`npm install` / `npm run dev`) — they already
  match this audience's skill level.
- No packaging work for this audience — they run from source.
- `LICENSE`: already MIT via `package.json`, no change needed.

## Testing & Verification

Consistent with the project's existing convention (no test framework;
manual `curl` + Playwright verification scripts written and deleted
per-task, as seen in `specs/003-category-management/plan.md`):

- **Project 1:** build the `.exe` on the dev machine, copy the zip to a
  clean folder (simulating "friend's machine"), double-click, confirm
  browser opens, confirm `data/costume-manager.db` is freshly created
  (not the dev machine's real data).
- **Project 2:** Playwright script hits the new export endpoint, confirms
  a valid PNG is returned with non-trivial byte size, manually opens the
  PNG once to confirm layout isn't broken.
- **Project 3:** after migration script runs, `curl` the deployed Vercel
  URL's API endpoints and confirm row counts match the local database's
  counts; confirm requests without the correct password are rejected;
  confirm requests with it succeed.
- **Project 4:** after pushing, clone the public repo into a scratch
  folder and run `npm install && npm run dev` from a clean checkout to
  confirm the README's instructions are sufficient on their own.

## Out of Scope (this round)

- Multi-user accounts or sharing permissions of any kind
- Real-time or periodic sync between the friend offline copies, the
  user's cloud copy, and any future local copy
- Windows code-signing for the `.exe`
- A public read-only share link for the inventory (superseded by
  Project 2's image export)
- Mobile-native app / PWA rewrite (discussed as "Option C" during
  brainstorming, rejected as out of proportion to the actual need once
  Project 3's cloud approach was chosen)
- Running the server directly on-device via Termux (discussed as
  "Option B", rejected in favor of Project 3's cloud hosting)
- Contribution guidelines / issue templates for the open-source release —
  audience this round is a handful of friends, not the general public
