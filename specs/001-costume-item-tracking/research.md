# Research: Costume Item Tracking

All Technical Context items were resolved directly (no [NEEDS CLARIFICATION]
markers remained after `/speckit-plan`). This file documents the rationale
so future contributors understand why each choice was made.

## Decision: Node.js + Express for the API layer

- **Decision**: Use Node.js with Express for the HTTP/API layer.
- **Rationale**: Express is a minimal, extremely well-documented framework
  with no required external services — installs via `npm install` alone.
  Any contributor to this open-source project (or a cosplayer wanting to
  self-host) is likely to already have Node.js available, and setup is a
  single command. Keeps to Principle I (local-first) and Principle V
  (scope discipline: no unnecessary framework features).
- **Alternatives considered**:
  - **Fastify**: faster and more "modern," but adds conceptual overhead
    (plugin system) not justified for a project this small.
  - **Python/Flask**: equally simple, but Node keeps consistency with the
    maintainer's existing automation scripts, reducing personal maintenance
    friction — not a hard technical requirement, but a reasonable tie-breaker.

## Decision: better-sqlite3 (embedded SQLite) for storage

- **Decision**: Use `better-sqlite3` for a single-file, embedded SQLite
  database per instance.
- **Rationale**: Satisfies Principle I directly — zero external database
  server to install or configure. The single `.db` file is trivially
  backed up or copied between machines, which also serves Principle II
  (portability) alongside the in-app CSV/JSON export required by FR-007.
  `better-sqlite3` is synchronous and simple, which fits a low-concurrency,
  single-user tool — no need for async DB drivers built for high-throughput
  multi-tenant servers.
- **Alternatives considered**:
  - **Flat JSON/Markdown files with no query engine**: simpler at first
    glance, but re-implements indexing/search logic by hand for FR-002
    (search by name/category/character) — SQLite gives this for free via
    `WHERE`/`LIKE` and indexes.
  - **Cloud-hosted database (e.g., Supabase/Postgres)**: directly violates
    Principle I (local-first, no cloud dependency) — rejected outright.

## Decision: Node's built-in test runner (`node:test`)

- **Decision**: Use `node:test` (built into Node.js 18+) instead of adding a
  test framework dependency.
- **Rationale**: Zero additional dependency, and this project's test needs
  (contract shape checks, a few integration flows, some unit tests on status
  transitions) do not require the extra features of Jest/Vitest (snapshot
  testing, mocking frameworks, etc.). Keeps the dependency tree small, which
  matters for an open-source tool other people will `npm install`.
- **Alternatives considered**:
  - **Vitest**: nicer DX and watch mode, but an extra dependency for
    marginal benefit at this project's size.
  - **Jest**: heavier install, slower cold start, unnecessary here.

## Open questions resolved by informed default (documented in spec.md Assumptions)

- Single-user, single-instance scope (no multi-tenancy) — confirmed by user
  as "each cosplayer runs their own copy."
- No barcode/QR/photo-recognition in this feature — explicitly deferred to
  the separate Photo Organizer idea from the original brainstorm document.
