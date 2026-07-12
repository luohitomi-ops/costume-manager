# API Contract: Costume Item Tracking

All endpoints are served locally by the self-hosted instance (e.g.
`http://localhost:3000`). Request/response bodies are JSON unless noted.

## `POST /api/characters`

Create a character.

**Request body**: `{ "name": "雷姆" }`

**Response 201**: `{ "id": 1, "name": "雷姆", "created_at": "2026-07-11T00:00:00Z" }`

**Errors**: `400` if `name` is missing/empty.

## `GET /api/characters`

List all characters.

**Response 200**: `[{ "id": 1, "name": "雷姆" }, ...]`

## `GET /api/characters/:id/items`

List all items (default: active only) belonging to one character —
supports User Story 3 (review a character's full loadout).

**Query params**: `include_inactive` (optional boolean, default `false`)

**Response 200**: `[{ item... }, ...]` (Item shape below). Empty array if
the character has no items (not an error).

**Errors**: `404` if character does not exist.

## `POST /api/items`

Register a new item — supports User Story 1.

**Request body**:
```json
{
  "character_id": 1,
  "name": "白色假髮",
  "category": "wig",
  "status": "in_storage",
  "location": "衣櫃A-2號箱",
  "photo_path": null,
  "note": null
}
```

`status` defaults to `"unassigned"` if omitted. `location`/`borrower` must
match the `status` per the validation rules in `data-model.md`.

**Response 201**: the created Item, including system-assigned `id`,
`active: true`, `created_at`, `updated_at`.

**Errors**: `400` if required fields missing, category invalid, or
status/location/borrower combination is inconsistent.

## `GET /api/items`

Search/query items — supports User Story 2 (find where an item is).

**Query params** (all optional, combinable):
- `q` — free-text match against item name
- `category` — filter by `costume`/`wig`/`shoes`/`prop`
- `character_id` — filter by character
- `include_inactive` — boolean, default `false`

**Response 200**: `[{ item... }, ...]`. Empty array (not an error) if no
match — per spec Acceptance Scenario "clearly states no match was found";
the caller/UI is responsible for rendering that message from an empty list.

## `PATCH /api/items/:id`

Update an item — supports marking lent out/returned, editing location,
retiring an item (FR-005, FR-006).

**Request body** (any subset): `{ "status": "lent_out", "borrower": "小美" }`

**Response 200**: the updated Item.

**Errors**: `400` on invalid status/location/borrower combination, `404` if
item does not exist.

## `GET /api/export`

Full data export — supports FR-007 / Success Criterion SC-004.

**Query params**: `format` — `csv` or `json` (default `json`)

**Response 200**: all Characters and Items in the requested format, with
every field from the data model present (no lossy fields), so the export
can be inspected or re-imported without loss.

## Item shape (referenced above)

```json
{
  "id": 1,
  "character_id": 1,
  "name": "白色假髮",
  "category": "wig",
  "status": "in_storage",
  "location": "衣櫃A-2號箱",
  "borrower": null,
  "photo_path": null,
  "note": null,
  "active": true,
  "created_at": "2026-07-11T00:00:00Z",
  "updated_at": "2026-07-11T00:00:00Z"
}
```
