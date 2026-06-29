// Owner-scoped service layer — the shared core behind the web app (server
// actions), and later the GraphQL API and MCP server. Every function is shaped
// (ownerId, input) => result, enforces ownership, and is free of any web
// framework (no next/*, FormData, cookies, or request objects). Server-only:
// these modules touch Prisma and the R2 client.
export * as books from "./books";
export * as passages from "./passages";
export * as tags from "./tags";
export * as placements from "./placements";
export * as variants from "./variants";
export * as references from "./references";
export * as search from "./search";
export { ServiceError, isServiceError, type ServiceErrorCode } from "./errors";
