import { prisma } from "@/lib/prisma";
import { rankByQuery, tagPath, type TagNode } from "@/lib/tag-tree";

import { ServiceError } from "./errors";

// Reusable per-user tag tree of infinite depth. Only roots carry a `type`;
// sub-tags have a name only. Candidates at level n+1 are the children of the tag
// chosen at level n. Uniqueness is enforced per (ownerId, parentId, name) and,
// for roots, per (ownerId, type, name) via a partial index. Every query is
// owner-scoped. Pure helpers (rankByQuery, tagPath) and the TagNode type live in
// the client-safe lib/tag-tree module and are re-exported here for convenience.

export { rankByQuery, tagPath, type TagNode } from "@/lib/tag-tree";

export type CreateTagInput = {
  parentId?: string | null;
  type?: string | null;
  name: string;
};

const SEARCH_LIMIT = 20;

// Distinct root types (fuzzy over the caller's existing root types).
export async function searchRootTypes(ownerId: string, query: string): Promise<string[]> {
  const roots = await prisma.tag.findMany({
    where: { ownerId, parentId: null, type: { not: null } },
    select: { type: true },
    distinct: ["type"],
  });
  const types = roots.map((r) => r.type as string);
  return rankByQuery(types, (t) => t, query).slice(0, SEARCH_LIMIT);
}

// Root tags of a given type, fuzzy over name.
export async function searchRootTags(ownerId: string, type: string, query: string) {
  const roots = await prisma.tag.findMany({
    where: { ownerId, parentId: null, type },
    select: { id: true, parentId: true, type: true, name: true },
  });
  return rankByQuery(roots, (t) => t.name, query).slice(0, SEARCH_LIMIT);
}

// Children of a chosen tag, fuzzy over name (parent ownership confirmed).
export async function searchChildren(ownerId: string, parentId: string, query: string) {
  const parent = await prisma.tag.findFirst({
    where: { id: parentId, ownerId },
    select: { id: true },
  });
  if (!parent) throw new ServiceError("tagNotFound");
  const children = await prisma.tag.findMany({
    where: { ownerId, parentId },
    select: { id: true, parentId: true, type: true, name: true },
  });
  return rankByQuery(children, (t) => t.name, query).slice(0, SEARCH_LIMIT);
}

// Create-on-the-fly at any level. Find-or-create so the same node is reused
// across placements (idempotent on the uniqueness key, race-safe via P2002).
export async function createTag(ownerId: string, input: CreateTagInput): Promise<TagNode> {
  const name = input.name?.trim();
  if (!name) throw new ServiceError("tagNameRequired");

  const parentId = input.parentId ?? null;
  let type: string | null;

  if (parentId === null) {
    // Root: requires a type, never a parent type carried in.
    type = input.type?.trim() || null;
    if (!type) throw new ServiceError("tagTypeRequired");
  } else {
    // Sub-tag: parent must be owned; sub-tags carry no type.
    const parent = await prisma.tag.findFirst({
      where: { id: parentId, ownerId },
      select: { id: true },
    });
    if (!parent) throw new ServiceError("tagParentInvalid");
    type = null;
  }

  const existing = await prisma.tag.findFirst({
    where: { ownerId, parentId, name, ...(parentId === null ? { type } : {}) },
    select: { id: true, parentId: true, type: true, name: true },
  });
  if (existing) return existing;

  try {
    return await prisma.tag.create({
      data: { ownerId, parentId, type, name },
      select: { id: true, parentId: true, type: true, name: true },
    });
  } catch (error) {
    // Concurrent create of the same node: fall back to the now-existing row.
    if (isUniqueViolation(error)) {
      const row = await prisma.tag.findFirst({
        where: { ownerId, parentId, name, ...(parentId === null ? { type } : {}) },
        select: { id: true, parentId: true, type: true, name: true },
      });
      if (row) return row;
    }
    throw error;
  }
}

export async function renameTag(ownerId: string, id: string, name: string) {
  const trimmed = name?.trim();
  if (!trimmed) throw new ServiceError("tagNameRequired");
  const res = await prisma.tag.updateMany({
    where: { id, ownerId },
    data: { name: trimmed },
  });
  if (res.count === 0) throw new ServiceError("tagNotFound");
}

// Deleting a tag cascades to its descendants and to placement_tag rows (schema
// onDelete: Cascade). Documented choice: cascade rather than block.
export async function deleteTag(ownerId: string, id: string) {
  const res = await prisma.tag.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new ServiceError("tagNotFound");
}

// Every tag the caller owns (for the management tree and path resolution).
export function listAllTags(ownerId: string): Promise<TagNode[]> {
  return prisma.tag.findMany({
    where: { ownerId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: { id: true, parentId: true, type: true, name: true },
  });
}

// Resolve a tag's ancestry root->node by walking parentId. Owner-scoped at root.
export async function getTagPath(ownerId: string, tagId: string): Promise<TagNode[]> {
  const path: TagNode[] = [];
  let current: string | null = tagId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const node: TagNode | null = await prisma.tag.findFirst({
      where: { id: current, ownerId },
      select: { id: true, parentId: true, type: true, name: true },
    });
    if (!node) throw new ServiceError("tagNotFound");
    path.unshift(node);
    current = node.parentId;
  }
  return path;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
