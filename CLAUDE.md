@AGENTS.md

# amadis

A French-linguistics annotation tool. Users upload or paste French text and annotate
it (tokens, parts of speech, syntactic and morphological features, glosses), then store
and review those annotations.

## Status

Built on the App Router (TypeScript, Tailwind, ESLint), organised around **Books →
Passages**:

- **Auth** — Neon Auth sign-in / sign-up / sign-out (`app/auth/*`), session handler at
  `app/api/auth/[...path]/route.ts`, route protection via `proxy.ts`, `requireUser()` in
  `lib/session.ts`.
- **Service layer** — owner-scoped domain core in `lib/services/*` (`books`, `passages`,
  `tags`, `placements`, `variants`, `references`, `search`), shaped `(ownerId, input) =>
  result`. Framework-free (no `next/*`, `FormData`, cookies) so the same core backs server
  actions today and GraphQL / MCP later. Throws `ServiceError` with a stable `code` that
  maps to an `errors.*` i18n key.
- **Books & passages** — books CRUD + per-book PDF (`app/(app)/books/`), passages CRUD with
  manual PDF segmentation into `(startPage, startFrac) → (endPage, endFrac)` regions.
- **Tags** — reusable per-user **tag tree** of infinite depth (`<TagTreePicker>`), create-on-
  the-fly at every level.
- **Annotation** — **placements**: spans over a passage's `title` or `text` carrying 0..n
  tags + a free description (Spectra annotator). Descriptions can **cross-reference**
  another span / passage / variant.
- **Variants** — alternative versions of a passage (own text + own scan).
- **Scans / PDF** — upload to R2 via presigned PUT; the book PDF is streamed back through a
  same-origin route so pdf.js renders it without R2 CORS (`lib/r2.ts`,
  `app/_components/pdf-document.tsx`).
- **Data** — Prisma 7 + Neon, `Book` / `Passage` / `Tag` / `Placement` / `PlacementTag` /
  `PlacementRef` / `Variant` models, single `rework_init` migration. Every query is
  owner-scoped.

## Planned stack

- **Next.js** (App Router, TypeScript) — web app and API routes
- **Neon Postgres** — primary database (serverless Postgres)
- **Prisma** — ORM and migrations
- **Neon Auth** — authentication
- **Cloudflare R2** — object storage (uploaded documents, exports)
- **Vercel** — hosting and CI/CD deploys, wired to the GitHub repo

## MCP servers

Configured at project scope in `./.mcp.json` (committed). These are OAuth HTTP endpoints
with no embedded tokens. Authenticate per session via `/mcp`. Never commit secrets here.

- **neon** — `https://mcp.neon.tech/mcp` — manage Neon Postgres projects and databases
- **vercel** — `https://mcp.vercel.com` — read-only Vercel project and deployment info

## Conventions

- No secrets in the repo. Local env goes in `.env*` (gitignored). `.vercel` is gitignored.
- Package manager: npm.

## Database / Prisma

- Prisma 7 with `@prisma/adapter-neon`. The generated client lives in `generated/prisma` (gitignored, run `prisma generate`).
- `DATABASE_URL` is the POOLED connection (host has `-pooler`), used by the app at runtime through the `PrismaNeon` adapter.
- `DIRECT_URL` is the DIRECT connection (no `-pooler`), used by `prisma migrate`. The datasource in `prisma/schema.prisma` points at `DIRECT_URL`.
- Neon Auth (Better Auth based) owns the `neon_auth` schema (identity table is `neon_auth.user`, plus `session`, `account`, `jwks`, ...). Prisma owns only the public schema and never migrates `neon_auth`.
- **All data is user-specific. There is no cross-user data.** Every public table (`book`, `passage`, `tag`, `placement`, `placement_tag`, `placement_ref`, `variant`) has an `owner_id` TEXT column = `neon_auth.user.id`, with no foreign key into the managed schema. Every query MUST filter `where: { ownerId: session.user.id }` — enforced in `lib/services/*`. Tag siblings are unique per `(ownerId, parentId, name)`; root tags are additionally unique per `(ownerId, type, name)` via a partial index `WHERE parent_id IS NULL`. `PlacementRef` is polymorphic (`targetType` + `targetId`, no FK) — the service validates target ownership. To show user names, LEFT JOIN `neon_auth.user` on `owner_id`.

## Neon Auth (Better Auth)

- SDK is `@neondatabase/auth`. Server instance from `@neondatabase/auth/next/server` (`createNeonAuth`), client from `@neondatabase/auth/next` (`createAuthClient`).
- Env vars: `NEON_AUTH_BASE_URL` (the branch Auth URL, differs per Neon branch) and `NEON_AUTH_COOKIE_SECRET` (32+ char secret for signing the session cookie).
- Next 16 uses `proxy.ts` at the repo root for middleware, not `middleware.ts`. Export `default auth.middleware({ loginUrl })` and a `config.matcher`.
- Server components calling `auth.getSession()` must export `dynamic = 'force-dynamic'`.

## Annotation offsets

Placement spans are **Unicode code-point** offsets into the NFC-normalized passage field —
either `Passage.title` or `Passage.text`, selected by `Placement.field` (`"TITLE"` |
`"TEXT"`). `start` is inclusive, `end` is exclusive. The annotation UI MUST NFC-normalize the
text before computing offsets and count code points (`lib/offsets.ts`), not UTF-16 units and
not bytes, so offsets stay consistent across client and server. A single word, a word group,
and a few letters are all just spans, and overlapping spans are allowed. Each placement
carries 0..n tags **and/or** a free description; a placement must have at least one of the two.
