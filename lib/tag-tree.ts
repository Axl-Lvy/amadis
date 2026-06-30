// Client-safe pure tag-tree helpers — NO Prisma / server imports — so client
// components (the tag picker, the annotator) can rank candidates and build tag
// paths without pulling the server service bundle into the browser. The
// server-side, owner-scoped tag operations live in lib/services/tags.ts.

export type TagNode = {
  id: string;
  parentId: string | null;
  type: string | null;
  name: string;
};

// Rank by prefix-then-substring (case-insensitive), then alphabetically. Empty
// query keeps the alphabetical order.
export function rankByQuery<T>(items: T[], key: (t: T) => string, query: string): T[] {
  const q = query.trim().toLocaleLowerCase();
  const scored = items.map((item) => {
    const value = key(item).toLocaleLowerCase();
    let score = 3;
    if (q === "") score = 0;
    else if (value.startsWith(q)) score = 0;
    else if (value.includes(q)) score = 1;
    return { item, value, score };
  });
  return scored
    .filter((s) => s.score < 3)
    .sort((a, b) => a.score - b.score || a.value.localeCompare(b.value))
    .map((s) => s.item);
}

// Build a tag's root->node path from an in-memory node set (avoids per-tag round
// trips when rendering many placements). Unknown ids yield [].
export function tagPath(nodesById: Map<string, TagNode>, tagId: string): TagNode[] {
  const path: TagNode[] = [];
  const seen = new Set<string>();
  let current: string | null = tagId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodesById.get(current);
    if (!node) break;
    path.unshift(node);
    current = node.parentId;
  }
  return path;
}
