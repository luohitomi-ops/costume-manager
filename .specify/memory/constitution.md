<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles: V. Core Scope Discipline → V. Deliberate Scope Growth
  (renamed; loosened from "reject unrelated features" to "expansion is
  expected, but every addition must be justified" — materially expanded/
  changed guidance, not a removal, hence MINOR not MAJOR)
- Added sections: none
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md ✅ (no agent-specific conflicts found)
  - .specify/templates/spec-template.md ✅ (no agent-specific conflicts found)
  - .specify/templates/tasks-template.md ✅ (no agent-specific conflicts found)
  - .specify/templates/commands/*.md ✅ (generic guidance, no changes needed)
- Follow-up TODOs: none
-->

# Costume Manager Constitution

## Core Principles

### I. Local-First, No Cloud Dependency
The application MUST store all data locally (flat files such as Markdown/JSON,
or an embedded database such as SQLite). It MUST NOT require user account
creation, third-party authentication, or a network connection to function.
Rationale: anyone downloading the tool must be able to run it immediately,
without depending on a service that could shut down or leak private data.

### II. Data Portability
All user data (characters, costumes, wigs, shoes, props, storage locations)
MUST be exportable to open, non-proprietary formats (CSV, JSON, or Markdown).
The application MUST NOT lock data into a format only readable by itself.
Rationale: users must be able to back up or migrate their data without
depending on this tool continuing to exist.

### III. Radical Simplicity of Interface
The primary use case is "find where an item is in seconds while standing in
front of a closet or storage bin." The interface MUST minimize steps to look
up or register an item, and MUST be usable from a mobile browser. Features
that add interaction steps without serving this lookup/registration use case
MUST be rejected or deferred.

### IV. Open-Source Friendly by Default
Code MUST NOT embed personal data, secrets, or API keys belonging to the
maintainer. Any Cosplayer MUST be able to install the project and start
entering their own data without modifying source code. Configuration (if
any) MUST be done through a config file or setup step, never by editing code.

### V. Deliberate Scope Growth
The application started with a minimal core loop — **querying** ("where is
this costume/wig/prop right now") and **registering** ("record this item and
its location") — but is expected to grow over time as new needs surface.
Growth MUST be deliberate, not accidental: every new feature MUST have a
clear one-line answer to "what problem does this solve," recorded in that
feature's spec. Features MUST NOT be added purely because they seem easy or
because a similar tool has them. This principle does not cap the feature
set; it caps *unexamined* additions.

## Technology Constraints

No specific language or framework is mandated by this constitution; that
decision is made during `/speckit-plan`. Whatever stack is chosen MUST satisfy
Principle I (local-first) and Principle II (portable data) without added
infrastructure (no required server, no required account, no required paid
service).

## Development Workflow

This project follows the Spec Kit workflow: constitution → specify → clarify
→ plan → tasks → implement. Every feature change MUST trace back to a
requirement in the current spec. Since this is a solo-maintained open-source
tool, formal code review is not required, but every implemented feature MUST
be checked against the Core Principles above before being merged into the
main branch.

## Governance

This constitution supersedes any conflicting practice or ad-hoc decision made
during implementation. Amendments require: (1) a written rationale for the
change, (2) a version bump following semantic versioning (MAJOR for
incompatible principle removal/redefinition, MINOR for new principles or
materially expanded guidance, PATCH for wording/clarity fixes), and (3)
propagation of the change into any dependent templates or docs that
reference the amended principle. All specs and plans produced by this
project MUST be checked for compliance with these principles before
`/speckit-implement` is run.

**Version**: 1.1.0 | **Ratified**: 2026-07-11 | **Last Amended**: 2026-07-11
