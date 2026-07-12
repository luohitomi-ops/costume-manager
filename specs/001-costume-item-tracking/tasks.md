# Tasks: Costume Item Tracking

**Input**: Design documents from `/specs/001-costume-item-tracking/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

Tests are not included as separate tasks (not requested for this feature).
`quickstart.md`'s 4 validation scenarios serve as the manual acceptance
check, run in the Polish phase.

## Phase 1: Setup (project initialization)

- [X] T001 Initialize Node.js project: `package.json` with `express` and
      `better-sqlite3` dependencies, `"type": "module"`, in repo root
- [X] T002 [P] Create `.gitignore` excluding `node_modules/` and `data/`
      in repo root
- [X] T003 [P] Create directory structure per plan.md:
      `src/db/`, `src/models/`, `src/routes/`, `public/`, `tests/`

## Phase 2: Foundational (blocking prerequisites)

**⚠️ Must complete before any user story work begins**

- [X] T004 Write SQLite schema (characters + items tables, per
      `data-model.md` field/constraint definitions) in `src/db/schema.sql`
- [X] T005 Implement DB connection/initializer that opens (or creates)
      `data/costume-manager.db` and applies `src/db/schema.sql` on first
      run, in `src/db/connection.js`
- [X] T006 Create Express app entry point that loads the DB connection,
      mounts route modules, and serves `public/` as static files, in
      `src/server.js`

**Checkpoint**: Server starts, creates the database file, and responds to a
basic request — no functional endpoints yet.

## Phase 3: User Story 1 - Register an Item and Its Location (Priority: P1) 🎯 MVP

**Goal**: A user can register a character and register an item (costume/
wig/shoes/prop) tied to that character with a location or borrower.

**Independent Test**: Register one character, then one item under it with a
storage location, and confirm the item is persisted with that location.

- [X] T007 [P] [US1] Implement Character model (create, list) in
      `src/models/character.js`, per `data-model.md` Character entity
- [X] T008 [P] [US1] Implement Item model create function with
      status/location/borrower validation rules from `data-model.md`
      (`in_storage` requires location + no borrower; `lent_out` requires
      borrower + no location; `unassigned` requires neither) in
      `src/models/item.js`
- [X] T009 [US1] Implement `POST /api/characters` route per
      `contracts/api.md` in `src/routes/characters.js`
- [X] T010 [US1] Implement `POST /api/items` route per `contracts/api.md`,
      returning `400` on invalid category or inconsistent
      status/location/borrower, in `src/routes/items.js`
- [X] T011 [US1] Wire `characters` and `items` routers into
      `src/server.js`
- [X] T012 [US1] Add a minimal unstyled registration form (character name,
      item name/category/status/location-or-borrower) to
      `public/index.html` for manual end-to-end testing — no visual design
      work, functional only per project direction

**Checkpoint**: User Story 1 fully functional and independently testable.

## Phase 4: User Story 2 - Find Where an Item Is (Priority: P1)

**Goal**: A user can search registered items by name/category/character and
see the current location or borrower.

**Independent Test**: With items already registered (via US1), search by
name and confirm the correct location/borrower is returned; search for a
non-existent name and confirm an empty result.

- [X] T013 [US2] Implement search/query function (by `q`, `category`,
      `character_id`, `include_inactive`) in `src/models/item.js`
- [X] T014 [US2] Implement `GET /api/items` route per `contracts/api.md`
      in `src/routes/items.js`
- [X] T015 [US2] Implement `PATCH /api/items/:id` route handling status
      transitions (unassigned/in_storage/lent_out) and the `active` flag,
      re-validating the location/borrower rules, in `src/routes/items.js`
- [X] T016 [US2] Add a minimal unstyled search box + result list to
      `public/index.html` (shows location or borrower per result; shows a
      clear "no match" message on empty results)

**Checkpoint**: User Stories 1 AND 2 both functional — the core "find it in
seconds" promise is testable end-to-end.

## Phase 5: User Story 3 - Review a Character's Full Loadout (Priority: P2)

**Goal**: A user can view all items belonging to one character in a single
list, to check completeness before an event.

**Independent Test**: Register several items under one character, then
fetch that character's item list and confirm all appear together; fetch a
character with zero items and confirm an empty (not error) response.

- [X] T017 [US3] Implement `GET /api/characters/:id/items` route per
      `contracts/api.md` (404 if character doesn't exist, empty array if
      it has no items) in `src/routes/characters.js`
- [X] T018 [US3] Add a character-loadout view to `public/index.html`
      (select a character, list all its items with current status)

**Checkpoint**: All three user stories functional independently and
together.

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Implement `GET /api/export` (json and csv formats) per
      `contracts/api.md`, in `src/routes/export.js`, mounted in
      `src/server.js`
- [X] T020 [P] Add `dev`/`start` npm scripts to `package.json` and a
      `README.md` with the setup/run instructions from `quickstart.md`
      (so any cosplayer can self-host per the project constitution)
- [X] T021 Run all 4 validation scenarios from `quickstart.md` manually
      end-to-end and confirm expected outcomes; note and fix any
      discrepancies before considering the feature done

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strictly sequential,
  blocks everything else.
- **Phase 3 (US1)** must complete before **Phase 4 (US2)** and
  **Phase 5 (US3)**, because both reuse the Item/Character models and
  route files US1 creates (`src/models/item.js`,
  `src/routes/items.js`, etc. are extended, not replaced).
- **Phase 4 (US2)** and **Phase 5 (US3)** touch different route handlers
  (`items.js` GET/PATCH vs. `characters.js` GET `:id/items`) and can be
  built in parallel by different contributors once Phase 3 is done.
- **Phase 6 (Polish)** depends on all user story phases being complete.

## Parallel Execution Examples

Within Phase 1: T002 and T003 can run in parallel (different files/dirs).

Within Phase 3: T007 (`character.js`) and T008 (`item.js`) can run in
parallel — different files, no shared state yet.

Across phases (once Phase 3 checkpoint is reached): Phase 4 and Phase 5 can
be worked on concurrently by two contributors, since they touch different
route files.

Within Phase 6: T019 and T020 can run in parallel.

## Implementation Strategy

**MVP = Phase 1 + 2 + 3 (User Story 1 only)**: gets a working
register-an-item flow — already useful as a bare inventory log even before
search exists.

**Incremental delivery**: MVP → add Phase 4 (search — the tool's core
promise) → add Phase 5 (per-character view) → Phase 6 polish (export +
docs). Each checkpoint above is independently demoable.
