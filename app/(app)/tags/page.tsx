import { getTranslations } from "next-intl/server";

import { listAllTags } from "@/lib/services/tags";
import type { TagNode } from "@/lib/tag-tree";
import { requireUser } from "@/lib/session";

import {
  createChildTagForm,
  createRootTagForm,
  deleteTagForm,
  renameTagForm,
} from "./actions";

// Reads the session + DB, so it renders dynamically.
export const dynamic = "force-dynamic";

type TreeNode = TagNode & { children: TreeNode[] };

// Deterministic spectrum hue per root type (kept in sync with the identical
// helper in tag-tree-picker.tsx — duplicated here so this Server Component never
// imports a value from a "use client" module). Colour is keyed by ROOT TYPE.
function hueForType(type: string | null | undefined): string {
  if (!type) return "var(--accent)";
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + (type.codePointAt(i) ?? 0)) >>> 0;
  return `var(--hue-${(h % 6) + 1})`;
}

// Build the per-user forest from the flat node list, sorted by name at each level.
function buildForest(nodes: TagNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (list: TreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  // Roots also group by type for a stable, readable order.
  roots.sort(
    (a, b) => (a.type ?? "").localeCompare(b.type ?? "") || a.name.localeCompare(b.name),
  );
  return roots;
}

export default async function TagsPage() {
  const user = await requireUser();
  const t = await getTranslations("tags");
  const tc = await getTranslations("common");

  const all = await listAllTags(user.id);
  const forest = buildForest(all);

  // Recursive node renderer. Server Component only — interactivity is via plain
  // <form> server actions, so no client bundle is needed for the management view.
  function renderNode(node: TreeNode, rootType: string | null, depth: number) {
    const hue = hueForType(rootType ?? node.type);
    return (
      <li key={node.id} style={{ listStyle: "none" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            marginLeft: depth * 20,
            borderLeft: "2px solid color-mix(in srgb, var(--c) 50%, transparent)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 9,
            ["--c" as string]: hue,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 9,
              height: 9,
              borderRadius: 3,
              background: "var(--c)",
              flex: "none",
            }}
          />
          {/* inline rename */}
          <form
            action={renameTagForm}
            style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}
          >
            <input type="hidden" name="id" value={node.id} />
            <label className="sr-only" htmlFor={`rename-${node.id}`}>
              {t("renameLabel")}
            </label>
            <input
              id={`rename-${node.id}`}
              name="name"
              defaultValue={node.name}
              className="field"
              style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-serif)", fontSize: 15 }}
            />
            {node.parentId === null && node.type && (
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  fontSize: 10,
                  color: "var(--c)",
                  background: "color-mix(in srgb, var(--c) 16%, transparent)",
                  padding: "2px 7px",
                  borderRadius: 5,
                  flex: "none",
                }}
              >
                {node.type}
              </span>
            )}
            <button type="submit" className="btn btn-ghost" style={{ padding: "6px 10px", flex: "none" }}>
              {tc("save")}
            </button>
          </form>
          {/* delete (cascades to descendants) */}
          <form action={deleteTagForm}>
            <input type="hidden" name="id" value={node.id} />
            <button
              type="submit"
              className="btn btn-ghost"
              style={{ padding: "6px 10px", color: "var(--hue-4)" }}
              aria-label={t("deleteAria", { name: node.name })}
            >
              {tc("delete")}
            </button>
          </form>
        </div>

        {/* add a child under this node */}
        <form
          action={createChildTagForm}
          style={{
            display: "flex",
            gap: 6,
            marginLeft: (depth + 1) * 20,
            marginTop: 4,
            marginBottom: 4,
          }}
        >
          <input type="hidden" name="parentId" value={node.id} />
          <label className="sr-only" htmlFor={`child-${node.id}`}>
            {t("addChildLabel")}
          </label>
          <input
            id={`child-${node.id}`}
            name="name"
            placeholder={t("addChildPlaceholder")}
            className="field"
            style={{ flex: 1, minWidth: 0 }}
          />
          <button type="submit" className="btn btn-ghost" style={{ padding: "6px 10px", flex: "none" }}>
            {tc("add")}
          </button>
        </form>

        {node.children.length > 0 && (
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {node.children.map((c) => renderNode(c, rootType ?? node.type, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <>
      <div className="content-header">
        <div>
          <h1>{t("title")}</h1>
          <p className="sub">{t("subtitle", { count: all.length })}</p>
        </div>
      </div>

      {/* new root tag */}
      <section className="card" style={{ marginBottom: 24 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>
          {t("newRoot")}
        </p>
        <form action={createRootTagForm} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <label className="sr-only" htmlFor="new-root-type">
            {t("typeLabel")}
          </label>
          <input
            id="new-root-type"
            name="type"
            placeholder={t("typePlaceholder")}
            className="field"
            style={{ flex: "1 1 160px", minWidth: 0 }}
            required
          />
          <label className="sr-only" htmlFor="new-root-name">
            {t("nameLabel")}
          </label>
          <input
            id="new-root-name"
            name="name"
            placeholder={t("namePlaceholder")}
            className="field"
            style={{ flex: "2 1 220px", minWidth: 0 }}
            required
          />
          <button type="submit" className="btn btn-primary" style={{ flex: "none" }}>
            {tc("create")}
          </button>
        </form>
      </section>

      {forest.length === 0 ? (
        <p className="muted" style={{ fontFamily: "var(--font-serif)", fontStyle: "italic" }}>
          {t("empty")}
        </p>
      ) : (
        <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {forest.map((root) => renderNode(root, root.type, 0))}
        </ul>
      )}

      {/* visually-hidden utility for labels */}
      <style>{`.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}`}</style>
    </>
  );
}
