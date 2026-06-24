@AGENTS.md

# amadis

A French-linguistics annotation tool. Users upload or paste French text and annotate
it (tokens, parts of speech, syntactic and morphological features, glosses), then store
and review those annotations.

## Status

A first vertical slice is built on the App Router (TypeScript, Tailwind, ESLint):

- **Auth** — Neon Auth sign-in / sign-up / sign-out (`app/auth/*`), session handler at
  `app/api/auth/[...path]/route.ts`, route protection via `proxy.ts`, `requireUser()` in
  `lib/session.ts`.
- **Textes** — list and create/delete (`app/textes/`), detail view with content and
  per-user tags (`app/textes/[id]/`).
- **Annotation** — span annotator over `Texte.content` (`annotator.tsx`), create/delete
  annotations and create tags (`app/textes/[id]/actions.ts`).
- **Scans** — upload a scan image to R2 via presigned PUT, attach to a texte, view via
  presigned GET (`scan-uploader.tsx`, `lib/r2.ts`).
- **Data** — Prisma 7 + Neon, `Texte` / `Tag` / `Annotation` models, initial migration
  applied. Every query is owner-scoped.

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
- **All data is user-specific. There is no cross-user data.** Every public table (`texte`, `tag`, `annotation`) has an `owner_id` TEXT column = `neon_auth.user.id`, with no foreign key (managed schema). Every query MUST filter `where: { ownerId: session.user.id }`. Tag uniqueness is per-user (`@@unique([ownerId, layer, code])`). To show user names, LEFT JOIN `neon_auth.user` on `owner_id`.

## Neon Auth (Better Auth)

- SDK is `@neondatabase/auth`. Server instance from `@neondatabase/auth/next/server` (`createNeonAuth`), client from `@neondatabase/auth/next` (`createAuthClient`).
- Env vars: `NEON_AUTH_BASE_URL` (the branch Auth URL, differs per Neon branch) and `NEON_AUTH_COOKIE_SECRET` (32+ char secret for signing the session cookie).
- Next 16 uses `proxy.ts` at the repo root for middleware, not `middleware.ts`. Export `default auth.middleware({ loginUrl })` and a `config.matcher`.
- Server components calling `auth.getSession()` must export `dynamic = 'force-dynamic'`.

## Annotation offsets

Annotation spans are **Unicode code-point** offsets into NFC-normalized `Texte.content`. `start` is inclusive, `end` is exclusive. The annotation UI MUST NFC-normalize the text before computing offsets and count code points, not UTF-16 units and not bytes, so offsets stay consistent across client and server. A single word, a word group, and a few letters are all just spans, and overlapping spans are allowed.
