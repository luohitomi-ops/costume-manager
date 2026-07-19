# Costume Manager

A self-hostable inventory tracker for cosplayers: register costumes, wigs,
shoes, and props against a character, and instantly find where any item
currently is (in storage, or lent out to someone).

Your data always stays in something *you* control — either a local file
on your own machine, or a cloud database under your own account. There is
no shared server, no account system run by anyone else, and nothing is
ever sent to the original author.

Two ways to run it, pick whichever fits:

## Option A: Run it locally (simplest)

```bash
npm install
npm run dev
```

The server starts at `http://localhost:3000` and creates
`data/costume-manager.db` automatically on first run. That file is the
entire database — back it up, move it, or delete it like any other file.
No account, no internet connection required, no password.

## Option B: Deploy your own cloud instance

Use this if you want to reach your inventory from your phone without your
computer needing to be on. This deploys a private copy that only you
control — you'll create your own free database and your own password, so
nobody (including the original author) has access to your data.

Requires: a [Vercel](https://vercel.com) account and a
[Turso](https://turso.tech) account (both have free tiers).

1. **Copy the env template and fill it in:**
   ```bash
   cp .env.example .env.local
   ```
   Create a Turso database (`turso db create` via their CLI, or through
   their dashboard) and fill in `TURSO_DATABASE_URL` and
   `TURSO_AUTH_TOKEN` in `.env.local`. Pick your own `ACCESS_PASSWORD` —
   this is the one password that gates your whole instance, so choose
   something only you know and don't put it in this file if you plan to
   commit it anywhere (`.env.local` is already gitignored, so this is
   safe by default).

2. **Create the database schema** (one-time, run once against a fresh
   Turso database):
   ```bash
   node scripts/setup-turso-schema.mjs
   ```

3. **(Optional) Migrate existing local data.** If you've already been
   using Option A and want your existing inventory to carry over instead
   of starting blank:
   ```bash
   node scripts/migrate-to-turso.mjs
   ```
   This refuses to run if the Turso database already has data in it —
   it's meant for a single one-time copy, not repeated syncing.

4. **Deploy to Vercel:**
   ```bash
   npx vercel link
   npx vercel env add TURSO_DATABASE_URL production
   npx vercel env add TURSO_AUTH_TOKEN production
   npx vercel env add ACCESS_PASSWORD production
   npx vercel env add DB_DRIVER production   # enter: turso
   npx vercel --prod
   ```
   Visit the deployed URL, enter your `ACCESS_PASSWORD`, and you're in.

**What this does not include:** multi-user accounts, password reset, or
any syncing between a local copy and a cloud copy — pick one as your
source of truth per instance.

## API

See [specs/001-costume-item-tracking/contracts/api.md](specs/001-costume-item-tracking/contracts/api.md)
for the full endpoint reference.

## Project docs

This project was built using [Spec Kit](https://github.com/github/spec-kit)'s
spec-driven workflow. See `.specify/memory/constitution.md` for project
principles and `specs/001-costume-item-tracking/` for the full spec, plan,
and task breakdown.
