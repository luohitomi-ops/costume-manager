# Costume Manager

A self-hostable inventory tracker for cosplayers: register costumes, wigs,
shoes, and props against a character, and instantly find where any item
currently is (in storage, or lent out to someone).

Each user runs their own instance locally — no account, no cloud service,
no shared database.

## Setup

```bash
npm install
npm run dev
```

The server starts at `http://localhost:3000` and creates
`data/costume-manager.db` automatically on first run.

## API

See [specs/001-costume-item-tracking/contracts/api.md](specs/001-costume-item-tracking/contracts/api.md)
for the full endpoint reference.

## Project docs

This project was built using [Spec Kit](https://github.com/github/spec-kit)'s
spec-driven workflow. See `.specify/memory/constitution.md` for project
principles and `specs/001-costume-item-tracking/` for the full spec, plan,
and task breakdown.
