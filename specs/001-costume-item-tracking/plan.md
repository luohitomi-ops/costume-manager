# Implementation Plan: Costume Item Tracking

**Branch**: `001-costume-item-tracking` | **Date**: 2026-07-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-costume-item-tracking/spec.md`

## Summary

A self-hostable, single-user inventory tool for cosplayers to register
costume items (costume/wig/shoes/prop) tied to a character and a current
location (storage location or borrower), and to instantly query where any
item currently is. Delivered as a small Node.js web service with an embedded
SQLite database, so any cosplayer can clone the repo and run their own
instance with no external services. This phase builds the data layer and API
only; a polished UI is explicitly deferred to a later feature per user
direction ("build functionality first, look at UI later") — a minimal
unstyled HTML page is included only so the API can be exercised end-to-end.

## Technical Context

**Language/Version**: Node.js 20 LTS, JavaScript (ES modules)

**Primary Dependencies**: Express (HTTP/API layer), better-sqlite3 (embedded,
file-based storage — no separate DB server to install)

**Storage**: SQLite, single file (e.g. `data/costume-manager.db`) per
instance. Satisfies Principle I (local-first) and Principle II (portable —
the raw file is copyable, and the app also exposes CSV/JSON export per
FR-007).

**Testing**: Node.js built-in test runner (`node:test`) — avoids adding a
test-framework dependency, in keeping with Principle V (scope discipline /
simplicity).

**Target Platform**: Cross-platform (Windows/macOS/Linux) — runs as a local
Node process, accessed via a browser at `http://localhost:<port>`.

**Project Type**: Self-hosted single-instance web service (backend API +
minimal HTML today; richer frontend is a future feature).

**Performance Goals**: Item search/query returns in well under 1 second for
a personal-scale collection (hundreds to a few thousand items) — no
performance engineering needed beyond straightforward indexed SQLite
queries.

**Constraints**: No external network calls at runtime. Must be installable
and runnable via a single documented `npm install` + `npm start` (or
equivalent) sequence, with no required account, API key, or paid service.
All data must live under one discoverable folder the user can back up.

**Scale/Scope**: Single user per running instance (each cosplayer runs their
own copy — no multi-tenancy). Expected volume: tens to a few thousand items,
tens of characters. Concurrent multi-user access within one instance is out
of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|-----------|-------|--------|
| I. Local-First, No Cloud Dependency | SQLite file + local Node server, no account, no external API required to function | PASS |
| II. Data Portability | Raw `.db` file is copyable; FR-007 requires CSV/JSON export in-app | PASS |
| III. Radical Simplicity of Interface | Deferred to UI feature, but API surface itself is limited to register/query/view-by-character, no extra steps | PASS |
| IV. Open-Source Friendly by Default | No secrets/keys in code; per-instance `data/` folder is the only per-user state, kept out of the repo via `.gitignore` | PASS |
| V. Core Scope Discipline | Plan covers exactly FR-001–FR-010 from spec; no shop/social/payment features introduced | PASS |

No violations — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-costume-item-tracking/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output (API contract)
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
# Option 1: Single project (chosen)
src/
├── db/
│   ├── schema.sql         # SQLite table definitions
│   └── connection.js      # opens/creates the local .db file
├── models/
│   ├── character.js        # Character queries (create/list)
│   └── item.js             # Item queries (create/search/update/export)
├── routes/
│   ├── characters.js       # /api/characters endpoints
│   └── items.js            # /api/items endpoints (register/search/update/export)
├── server.js               # Express app entry point, serves API + a bare
│                            # unstyled HTML page for manual testing
public/
└── index.html               # Minimal unstyled form + search box (functional only)

data/                        # Created at runtime, gitignored — holds the
                              # per-instance SQLite file

tests/
├── contract/                # Request/response shape tests per contracts/
├── integration/              # End-to-end: register → search → export
└── unit/                     # model-level logic (status transitions, etc.)
```

**Structure Decision**: Single project (Option 1) — this is a small
self-contained service, not a frontend/backend split with independent
deployment needs. `public/index.html` exists only to exercise the API
manually during this phase; it is intentionally unstyled and out of scope
for design work, per user direction to build functionality before UI.

## Complexity Tracking

*No violations — table not needed.*
