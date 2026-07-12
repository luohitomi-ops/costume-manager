# Feature Specification: Costume Item Tracking

**Feature Branch**: `001-costume-item-tracking`

**Created**: 2026-07-11

**Status**: Draft

**Input**: User description: "Cosplayer 需要追蹤自己的服裝/假髮/鞋子/道具，記錄每個角色對應哪些行頭，以及目前收納在哪裡或借給了誰。核心是能快速登記新道具與其收納位置，並能快速查詢『這個角色的某樣裝備現在在哪裡』。使用情境是整理衣櫃時翻箱倒櫃找東西，或準備下一場活動前確認行頭是否齊全。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register an Item and Its Location (Priority: P1)

As a cosplayer, I add a new item (costume, wig, shoes, or prop) tied to a
character, and record where it currently lives (a storage location, or who
borrowed it), so the item is trackable from the moment it enters my
collection.

**Why this priority**: Without registration there is nothing to query. This
is the entry point for all other value in the tool.

**Independent Test**: Can be fully tested by adding one item with a
character, category, and location, then confirming it appears in the item
list with the correct location — delivers value even with no other feature
built yet (a simple running inventory).

**Acceptance Scenarios**:

1. **Given** the item list is empty, **When** the user registers a new item
   with a name, category, character, and storage location, **Then** the item
   appears in the list showing that location.
2. **Given** an existing item, **When** the user marks it as lent out to a
   named person instead of a storage location, **Then** the item's status
   shows the borrower's name instead of a location.

---

### User Story 2 - Find Where an Item Is (Priority: P1)

As a cosplayer standing in front of a closet or storage bin, I search for an
item (by name, category, or character) and immediately see its current
location or who has it, so I stop digging through boxes.

**Why this priority**: This is the tool's core promise — "find it in
seconds" — and is equally critical to registration; a tool that only lets
you register but not search delivers no real value.

**Independent Test**: Can be fully tested by searching for a previously
registered item and confirming the correct location/borrower is returned in
under a few seconds, with no dependency on any other feature.

**Acceptance Scenarios**:

1. **Given** an item has been registered with a storage location, **When**
   the user searches by the item's name, **Then** the result shows that
   location.
2. **Given** an item has been marked as lent out, **When** the user searches
   for it, **Then** the result shows the borrower's name, not a storage
   location.
3. **Given** no item matches the search term, **When** the user searches,
   **Then** the system clearly states no match was found (not a blank or
   confusing result).

---

### User Story 3 - Review a Character's Full Loadout (Priority: P2)

As a cosplayer preparing for an upcoming event, I view all items associated
with one character in a single list, so I can confirm the full costume is
accounted for before packing.

**Why this priority**: Valuable for event prep, but the tool is still useful
without it (User Stories 1–2 alone already solve the "where is it" problem
item-by-item). This adds a character-level view on top.

**Independent Test**: Can be fully tested by registering several items under
the same character, then confirming all of them appear together when
filtering/viewing by that character.

**Acceptance Scenarios**:

1. **Given** multiple items are registered under the same character, **When**
   the user views that character, **Then** all of that character's items are
   listed together with their current status (location or borrower).
2. **Given** a character has zero registered items, **When** the user views
   that character, **Then** the system shows an empty state, not an error.

### Edge Cases

- What happens when an item has no location or borrower recorded yet
  (newly registered, not yet put away)? System MUST allow this as a valid
  "unassigned" state rather than requiring a location up front.
- How does the system handle two items with the same name (e.g., two
  different characters both have "白色假髮")? Items MUST be distinguished by
  the combination of name + character, not name alone.
- What happens when an item is retired/no longer in use? User MUST be able
  to mark an item inactive without permanently deleting its history.
- What happens when a borrower name is entered as free text and later
  misspelled? Out of scope for v1 — no borrower directory/validation is
  required; free text is acceptable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a user to register a new item with: name,
  category (costume / wig / shoes / prop), associated character, and current
  location or borrower.
- **FR-002**: System MUST allow a user to search/query items by item name,
  category, or character, and return the current location or borrower.
- **FR-003**: System MUST allow a user to mark an item's status as either
  "in storage at [location]" or "lent out to [person]", and switch between
  the two.
- **FR-004**: System MUST allow a user to view all items belonging to one
  character in a single list.
- **FR-005**: System MUST allow a user to edit an existing item's location,
  borrower, or other recorded fields.
- **FR-006**: System MUST allow a user to mark an item as inactive/retired
  without deleting its record.
- **FR-007**: System MUST allow full export of all item data to an open,
  non-proprietary format (CSV or JSON), per project constitution.
- **FR-008**: System MUST be usable from a mobile browser without a
  dedicated app install.
- **FR-009**: System MUST NOT require account creation or login to use.
- **FR-010**: System MUST allow an item to optionally include a reference
  photo or note, but MUST NOT require one to complete registration.

### Key Entities

- **Character**: A cosplay persona/role the user portrays. Has a name and
  owns zero or more Items.
- **Item**: A trackable physical object — costume, wig, shoes, or prop.
  Belongs to exactly one Character, has a category, a current status
  (in-storage-at-location, lent-out-to-person, or unassigned), an active/
  inactive flag, and an optional photo/note.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can find an item's current location by searching in
  under 10 seconds.
- **SC-002**: A user can register a new item in under 30 seconds.
- **SC-003**: 100% of registered items always show a determinate status
  (unassigned, in storage at X, or lent to Y) — never a blank/unknown state.
- **SC-004**: A full data export can be produced and re-imported (or
  manually inspected) without any loss of the original fields.
- **SC-005**: A user preparing for an event can view a character's complete
  item list in a single screen, without needing to search item-by-item.

## Assumptions

- Single-user tool for v1 — no multi-user accounts, permissions, or shared
  team inventories.
- Runs locally (per constitution); accessing it from a phone browser assumes
  the phone is on the same local network as the machine running the tool,
  or the user runs it directly on the phone if the chosen tech stack allows.
- No barcode/QR scanning or bulk photo-recognition in v1 — items are
  registered manually one at a time (this overlaps conceptually with the
  separate "Photo Organizer" idea, which is explicitly out of scope here).
- Borrower tracking is free-text only; no borrower directory or contact
  integration in v1.
- Existing data (if any) does not need to be migrated from another tool —
  this is a fresh start.
