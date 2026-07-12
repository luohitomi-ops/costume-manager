# Data Model: Costume Item Tracking

## Entity: Character

Represents a cosplay persona/role the user portrays.

| Field | Type | Rules |
|-------|------|-------|
| id | integer (PK, autoincrement) | system-assigned |
| name | text | required, non-empty |
| created_at | timestamp | system-assigned on insert |

Relationships: a Character owns zero or more Items (one-to-many).

## Entity: Item

Represents a trackable physical object: a costume, wig, pair of shoes, or
prop.

| Field | Type | Rules |
|-------|------|-------|
| id | integer (PK, autoincrement) | system-assigned |
| character_id | integer (FK → Character.id) | required |
| name | text | required, non-empty |
| category | enum: `costume` \| `wig` \| `shoes` \| `prop` | required |
| status | enum: `unassigned` \| `in_storage` \| `lent_out` | required, default `unassigned` |
| location | text, nullable | required if `status = in_storage`; must be null otherwise |
| borrower | text, nullable | required if `status = lent_out`; must be null otherwise |
| photo_path | text, nullable | optional reference photo file path/URL |
| note | text, nullable | optional free-text note |
| active | boolean | default `true`; set `false` to retire an item without deleting it (per FR-006) |
| created_at | timestamp | system-assigned on insert |
| updated_at | timestamp | system-assigned on every update |

### Validation rules

- `name` + `character_id` combination is expected to be unique in practice
  (per spec Edge Cases — two characters can each have a "白色假髮", but the
  same character should not have two identically-named active items). This
  is a soft validation (warn, not hard-block) to avoid over-engineering a
  rare edge case.
- `status = in_storage` → `location` MUST be non-null, `borrower` MUST be
  null.
- `status = lent_out` → `borrower` MUST be non-null, `location` MUST be
  null.
- `status = unassigned` → both `location` and `borrower` MUST be null.
- `active = false` items are excluded from default search results (FR-002)
  but remain queryable via an explicit "include inactive" flag, and are
  never physically deleted (satisfies FR-006 and the Edge Cases retirement
  requirement).

### State transitions

```text
   register (any initial status)
        │
        ▼
  ┌─────────────┐   set location   ┌──────────────┐
  │ unassigned  │ ───────────────▶ │ in_storage   │
  └─────────────┘                  └──────────────┘
        │  ▲                             │  ▲
        │  │        set borrower         │  │  clear status back to unassigned
        ▼  │                             ▼  │
  ┌─────────────┐ ◀─────────────── ┌──────────────┐
  │ lent_out    │   item returned  │ (transitions  │
  └─────────────┘   to storage     │  freely both  │
                                    │  ways)        │
                                    └──────────────┘
  Any status ──── mark inactive ───▶ active = false (item stays in DB,
                                     excluded from default search)
```

Any of the three statuses can transition directly to either of the other two
at any time (a lent-out item can go straight to a new storage location, or
vice versa) — there is no forced intermediate step.
