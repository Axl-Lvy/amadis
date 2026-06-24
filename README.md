# Amadis

A web-based tool for the close grammatical annotation of a Renaissance French text,
built for a PhD thesis in French linguistics.

Live: [amadis.axl-lvy.fr](https://amadis.axl-lvy.fr)

## Overview

Amadis stores transcribed texts alongside their source scans and lets you annotate them
at the character level — a whole word, a group of words, or just a fragment such as a
single inflectional ending. Annotations carry a configurable grammatical tagset, may
overlap freely (the same characters can belong to several annotations), and feed simple
SQL-backed statistics. Each user's corpus, tagset, and annotations are private to them.

It is a single-researcher tool rather than a product, but it is open source and the
stack is reproducible end to end.

## Features

- **Texts + scans.** Create a text from a pasted transcription and/or an uploaded page
  scan. A text can exist with no transcription yet (scan first, transcribe later).
- **Character-offset annotation.** Select any character range — word, multi-word group,
  or sub-word fragment (e.g. an ending) — and assign a tag.
- **Overlapping spans.** A given character may be covered by any number of annotations,
  so a word can belong to several groups at once.
- **Configurable tagset.** Tags are organised as `layer` + `code` (e.g. layer
  *catégorie* with code *nom*, or layer *accord* with code *f.pl.*), created on the fly.
- **Statistics.** Per-text counts by tag and by layer, computed in SQL.
- **Private per user.** Texts, tagset, and annotations are scoped to their owner; no
  cross-user reads.

## Tech stack

| Layer        | Choice                                                     |
|--------------|------------------------------------------------------------|
| Framework    | Next.js (App Router, React, TypeScript, Tailwind)          |
| Database     | Neon Postgres (EU region), with git-style branching        |
| ORM          | Prisma 7 + `@prisma/adapter-neon`                          |
| Auth         | Neon Auth (Better Auth–based)                              |
| Scan storage | Cloudflare R2 (S3-compatible), accessed via presigned URLs |
| Hosting      | Vercel                                                     |

## Architecture notes

**Standoff annotation over character offsets.** An annotation is a half-open range
`[start, end)` into a text's `content`. Offsets are **Unicode code points over
NFC-normalized text** (not UTF-16 units, not bytes), so they round-trip consistently
between the browser's Selection API and the database. This single model expresses words,
groups, and sub-word fragments uniformly, and overlapping ranges need no special casing.

**Identity boundary.** User identities live in the Neon Auth–managed `neon_auth` schema.
The application owns only the `public` schema and never migrates `neon_auth`. The
`ownerId` column on every public table stores the `neon_auth.user.id` as plain text with
**no foreign key**, since the identity sync is asynchronous.

### Data model

- **Texte** — `reference`, `content` (the transcription that offsets index into),
  `source` metadata, `scanKey` (the R2 object key), `ownerId`.
- **Tag** — `layer`, `code`, optional `label`, `ownerId`. Unique per `(ownerId, layer,
  code)` — tags are per-user.
- **Annotation** — `texteId`, `start`/`end` (code-point offsets), `tagId`, `ownerId`,
  optional `note`. Overlaps allowed.

The schema is intentionally minimal and grows through Prisma migrations (planned:
tokenisation for word/lemma frequencies, a multi-layer tagset).

## Getting started

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) project (Postgres) with Neon Auth enabled
- A [Cloudflare R2](https://developers.cloudflare.com/r2/) bucket and S3 API token

### Environment

Create `.env.local` (gitignored — never commit secrets):

```bash
# Neon — pooled for the app, direct for migrations
DATABASE_URL="postgresql://...-pooler.<region>.aws.neon.tech/<db>?sslmode=require"
DIRECT_URL="postgresql://...<region>.aws.neon.tech/<db>?sslmode=require"

# Neon Auth (per branch)
NEON_AUTH_BASE_URL="..."
NEON_AUTH_COOKIE_SECRET="..."

# Cloudflare R2
R2_ACCOUNT_ID="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET="..."
```

### Install and run

```bash
npm install
npx prisma migrate dev      # applies the schema to your database
npm run dev                 # http://localhost:3000
```

## Deployment

Deployments are driven by Git, with environments mirrored across the three layers:

| Layer       | Development / Preview  | Production   |
|-------------|------------------------|--------------|
| Git branch  | feature branches (PRs) | `main`       |
| Vercel env  | Preview / Development  | Production   |
| Neon branch | `development`          | `production` |
| R2 bucket   | dev bucket             | prod bucket  |

Pushing a feature branch triggers a Vercel Preview deploy against the `development` Neon
branch; merging to `main` triggers Production. The production build runs
`prisma generate && prisma migrate deploy && next build`, applying pending migrations to
the `production` branch. Environment variables are set per Vercel environment so each
points at its own database branch and bucket.

## Status

Early but functional: authentication, the text/scan/annotation vertical slice, and the
deployment pipeline are in place. Bulk corpus import and richer statistics are next.

## License

Released under the MIT License. See [LICENSE](./LICENSE).
