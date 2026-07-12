# Quickstart: Costume Item Tracking

Validates the feature end-to-end once implemented. No implementation code
here — see `tasks.md` (Phase 2) for that.

## Prerequisites

- Node.js 20 LTS installed
- Repository cloned locally

## Setup

```bash
npm install
npm run dev   # starts the local server, e.g. on http://localhost:3000
```

On first run, the server creates `data/costume-manager.db` automatically —
no manual database setup step.

## Validation Scenario 1: Register and find an item (User Stories 1 & 2)

1. `POST /api/characters` with `{ "name": "雷姆" }` → note the returned `id`.
2. `POST /api/items` with that `character_id`, `name: "白色假髮"`,
   `category: "wig"`, `status: "in_storage"`, `location: "衣櫃A-2號箱"`.
3. `GET /api/items?q=白色假髮` → expect one result showing
   `location: "衣櫃A-2號箱"`.
4. `PATCH /api/items/:id` with `{ "status": "lent_out", "borrower": "小美" }`.
5. `GET /api/items?q=白色假髮` again → expect the same item now showing
   `borrower: "小美"` and no `location`.

**Expected outcome**: the item's current whereabouts is always retrievable
by name search in one request (SC-001).

## Validation Scenario 2: Review a character's full loadout (User Story 3)

1. Register 3 items under the same `character_id` (mix of categories and
   statuses, including one `unassigned`).
2. `GET /api/characters/:id/items` → expect all 3 items returned together,
   each showing its correct status.
3. Create a second character with zero items, call the same endpoint for
   it → expect an empty array, not an error (per spec Acceptance Scenario).

## Validation Scenario 3: Export without data loss (SC-004)

1. With at least one character and one item registered, call
   `GET /api/export?format=json`.
2. Confirm every field from the Item shape in `contracts/api.md` is present
   and matches what was stored.
3. Repeat with `format=csv` and confirm the same fields are present as
   columns.

## Validation Scenario 4: Retire an item without deleting it (FR-006)

1. `PATCH /api/items/:id` with `{ "active": false }`.
2. `GET /api/items?q=<name>` (default, no `include_inactive`) → expect the
   item to no longer appear.
3. `GET /api/items?q=<name>&include_inactive=true` → expect the item to
   still appear, confirming it was retired, not deleted.
