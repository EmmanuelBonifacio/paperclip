# Migrations 0466 / 0467 — CRLF vs LF

**Do not edit the SQL of these migrations to force tests to pass.**

Drizzle stores `sha256` of the **raw file bytes**. Windows `core.autocrlf=true`
converts LF→CRLF and changes the hash even when the SQL is semantically identical.

## Canonical LF hashes (this fork / upstream)

| File | LF sha256 |
|------|-----------|
| `0466_drop_project_environment.sql` | `07ca1c666c6471fdb9ce7a0a5fb31bf1a074138466fa8daae50b53199b8e0d7c` |
| `0467_fair_human_torch.sql` | `50ce0eb2567570b098bea1de92fe6a220d139e4ba83438195fbbad1be51e31a1` |

CRLF simulation changes those digests (see SaaS `migrations-crlf-report.md`).

## What to do

1. `.gitattributes` keeps `packages/db/src/migrations/*.sql text eol=lf`.
2. On Windows: `git config core.autocrlf false` in the repo and re-checkout `.sql` if needed.
3. Run `pnpm test:setup` to reset the embedded/test database — **without** rewriting journal hashes or migration SQL.
4. If a local DB already recorded CRLF hashes, reset the test DB; do not “fix” the SQL.
