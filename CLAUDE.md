@AGENTS.md

# amadis

A French-linguistics annotation tool. Users upload or paste French text and annotate
it (tokens, parts of speech, syntactic and morphological features, glosses), then store
and review those annotations.

## Status

Infrastructure skeleton only. No application features yet. The current codebase is the
default `create-next-app` boilerplate (App Router, TypeScript, Tailwind, ESLint).

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
