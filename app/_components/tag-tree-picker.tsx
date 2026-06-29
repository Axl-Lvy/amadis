"use client";

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";

import { rankByQuery, type TagNode } from "@/lib/tag-tree";

import { createTag, searchChildren, searchRootTags, searchRootTypes } from "@/app/(app)/tags/actions";

// Type-allowing CSS custom properties on inline styles.
type Vars = CSSProperties & Record<`--${string}`, string>;

// --- props ----------------------------------------------------------------

type Props = {
  // Selected tag ids — each is the DEEPEST node of a chosen path. Multiple are
  // allowed. The picker resolves each id's full path for the chip label using
  // the `allTags` map when it can, falling back to a cached label.
  value: string[];
  onChange: (ids: string[]) => void;
  // Optional pre-known nodes (e.g. all of the owner's tags) so freshly added
  // selections can render their full path without an extra round trip. The
  // picker also remembers the nodes it discovers/creates during the session.
  allTags?: TagNode[];
};

// A draft path the user is assembling, one level at a time.
type Draft =
  | { stage: "type"; type: string }
  | { stage: "name"; type: string; nodes: TagNode[] }
  | { stage: "child"; type: string; nodes: TagNode[] };

const EMPTY_DRAFT: Draft = { stage: "type", type: "" };

// TagTreePicker — create-on-the-fly, level-by-level tag selection.
//
// Flow:
//   (1) TYPE   — fuzzy autocomplete over existing root types; free entry allowed.
//   (2) NAME   — fuzzy autocomplete over root names within the chosen type;
//                free entry creates a root (type, name).
//   (3) CHILD  — fuzzy autocomplete over children of the previously chosen tag;
//                free entry creates a child. Repeats for deeper levels.
// The selected tag is the deepest chosen node. Each node is persisted via
// createTag the moment the user picks/creates it (so its id is stable and the
// same node is reused across placements — find-or-create on the server). The
// committed selection is the deepest node of the draft, added as a chip.
export function TagTreePicker({ value, onChange, allTags = [] }: Readonly<Props>) {
  const t = useTranslations("tagPicker");
  const tc = useTranslations("common");
  const baseId = useId();

  // Nodes the picker discovers (via search) or creates during this session.
  // Merged with the `allTags` prop into the `known` catalogue below — keeping
  // these separate avoids mirroring props into state inside an effect, so chip
  // labels resolve to full paths without per-chip server calls.
  const [discovered, setDiscovered] = useState<Map<string, TagNode>>(() => new Map());

  const known = useMemo(() => {
    const m = new Map<string, TagNode>();
    for (const n of allTags) m.set(n.id, n);
    for (const [id, n] of discovered) if (!m.has(id)) m.set(id, n);
    return m;
  }, [allTags, discovered]);

  function remember(...nodes: TagNode[]) {
    setDiscovered((prev) => {
      let changed = false;
      const m = new Map(prev);
      for (const n of nodes) {
        if (m.get(n.id) !== n) {
          m.set(n.id, n);
          changed = true;
        }
      }
      return changed ? m : prev;
    });
  }

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ id: string | null; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The current parent node (deepest committed node of the in-progress path).
  const parent = draft.stage !== "type" ? draft.nodes[draft.nodes.length - 1] : null;

  // Debounced fetch of options for the current stage + query. The "type" stage
  // searches root types (string options, id:null). The "name"/"child" stages
  // search nodes (id is the real tag id).
  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      try {
        if (draft.stage === "type") {
          const types = await searchRootTypes(query);
          if (active) setOptions(types.map((name) => ({ id: null, name })));
        } else if (draft.stage === "name") {
          const roots = await searchRootTags(draft.type, query);
          if (active) {
            remember(...roots);
            setOptions(roots.map((r) => ({ id: r.id, name: r.name })));
          }
        } else {
          // child: search children of the current parent
          if (!parent) return;
          const children = await searchChildren(parent.id, query);
          if (active) {
            remember(...children);
            setOptions(children.map((c) => ({ id: c.id, name: c.name })));
          }
        }
      } catch {
        if (active) setOptions([]);
      }
    }, 140);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [draft, query, parent]);

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setQuery("");
    setOptions([]);
    setError(null);
  }

  // Stage transitions ------------------------------------------------------

  // TYPE chosen (existing or free): advance to the NAME stage.
  function chooseType(typeName: string) {
    const type = typeName.trim();
    if (!type) return;
    setDraft({ stage: "name", type, nodes: [] });
    setQuery("");
    setError(null);
    inputRef.current?.focus();
  }

  // NAME / CHILD: pick an existing node, then descend to its children.
  function chooseNode(node: TagNode) {
    remember(node);
    setDraft((d) => {
      const type = d.stage === "type" ? (node.type ?? "") : d.type;
      const nodes = d.stage === "type" ? [node] : [...d.nodes, node];
      return { stage: "child", type, nodes };
    });
    setQuery("");
    setError(null);
    inputRef.current?.focus();
  }

  // Free entry at NAME: create (or find) a root tag of (type, name).
  // Free entry at CHILD: create (or find) a child of the current parent.
  async function createFromQuery() {
    const name = query.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input =
        draft.stage === "name"
          ? { parentId: null, type: draft.type, name }
          : { parentId: parent?.id ?? null, name };
      const res = await createTag(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      chooseNode(res.tag);
    } finally {
      setBusy(false);
    }
  }

  // Commit the deepest node of the current path as a selected chip.
  function commitSelection() {
    if (!parent) return;
    if (!value.includes(parent.id)) onChange([...value, parent.id]);
    resetDraft();
  }

  function removeSelection(id: string) {
    onChange(value.filter((v) => v !== id));
  }

  // Pressing Enter: choose the single exact-match option, else create from query.
  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = query.trim().toLocaleLowerCase();
    if (draft.stage === "type") {
      chooseType(query);
      return;
    }
    const exact = options.find((o) => o.name.toLocaleLowerCase() === q && o.id);
    if (exact?.id) {
      const node = known.get(exact.id);
      if (node) chooseNode(node);
      return;
    }
    void createFromQuery();
  }

  // Path label for a selected id, root -> node.
  function pathLabel(id: string): string {
    const path: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = known.get(cur);
      if (!node) break;
      path.unshift(node.name);
      cur = node.parentId;
    }
    return path.length ? path.join(" › ") : t("unknownTag");
  }

  function rootTypeOf(id: string): string | null {
    const seen = new Set<string>();
    let cur: string | null = id;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = known.get(cur);
      if (!node) break;
      if (node.parentId === null) return node.type;
      cur = node.parentId;
    }
    return null;
  }

  // Render the breadcrumb of the in-progress draft.
  const breadcrumb: { key: string; label: string }[] = [];
  if (draft.stage !== "type") {
    breadcrumb.push({ key: "type", label: draft.type });
    draft.nodes.forEach((n) => breadcrumb.push({ key: n.id, label: n.name }));
  }

  const stageLabel =
    draft.stage === "type"
      ? t("stage.type")
      : draft.stage === "name"
        ? t("stage.name")
        : t("stage.child");

  const placeholder =
    draft.stage === "type"
      ? t("placeholder.type")
      : draft.stage === "name"
        ? t("placeholder.name")
        : t("placeholder.child");

  const filteredOptions = rankByQuery(options, (o) => o.name, query);
  const trimmed = query.trim();
  const canCreate =
    trimmed.length > 0 &&
    draft.stage !== "type" &&
    !options.some((o) => o.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
      data-testid="tag-tree-picker"
    >
      {/* selected chips */}
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {value.map((id) => {
            const hue = hueForType(rootTypeOf(id));
            return (
              <span
                key={id}
                style={
                  {
                    "--c": hue,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    padding: "4px 6px 4px 9px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in srgb, var(--c) 45%, transparent)",
                    background: "color-mix(in srgb, var(--c) 14%, transparent)",
                    color: "var(--foreground)",
                    maxWidth: "100%",
                  } as Vars
                }
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 3,
                    background: "var(--c)",
                    flex: "none",
                  }}
                />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pathLabel(id)}
                </span>
                <button
                  type="button"
                  onClick={() => removeSelection(id)}
                  aria-label={t("removeTag", { path: pathLabel(id) })}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "var(--muted)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* draft breadcrumb */}
      {breadcrumb.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 4,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          {breadcrumb.map((b, i) => (
            <span key={b.key}>
              {i > 0 && <span style={{ color: "var(--faint)" }}> › </span>}
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* input + stage hint */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--faint)",
            flex: "none",
          }}
          aria-hidden="true"
        >
          {stageLabel}
        </span>
        <input
          ref={inputRef}
          className="field"
          style={{ flex: 1, minWidth: 0 }}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError(null);
          }}
          onKeyDown={onInputKeyDown}
          placeholder={placeholder}
          aria-label={stageLabel}
          aria-describedby={`${baseId}-hint`}
          autoComplete="off"
        />
        {parent && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: "none", padding: "7px 11px" }}
            onClick={commitSelection}
          >
            {t("addSelection")}
          </button>
        )}
        {draft.stage !== "type" && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: "none", padding: "7px 9px" }}
            onClick={resetDraft}
            aria-label={t("resetDraft")}
          >
            {tc("cancel")}
          </button>
        )}
      </div>

      <span id={`${baseId}-hint`} className="muted" style={{ fontSize: 11 }}>
        {t("hint")}
      </span>

      {/* options dropdown */}
      {(filteredOptions.length > 0 || canCreate) && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 4,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            maxHeight: 200,
            overflowY: "auto",
            background: "var(--surface-2)",
            border: "1px solid var(--line-2)",
            borderRadius: 9,
          }}
        >
          {filteredOptions.map((o, i) => (
            <li key={o.id ?? `type-${o.name}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  if (draft.stage === "type") {
                    chooseType(o.name);
                  } else if (o.id) {
                    const node = known.get(o.id);
                    if (node) chooseNode(node);
                  }
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  color: "var(--ink-2)",
                  cursor: "pointer",
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in srgb, var(--foreground) 7%, transparent)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {o.name}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                onClick={() => void createFromQuery()}
                disabled={busy}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: "transparent",
                  color: "var(--accent)",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 6,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {t("createOption", { name: trimmed })}
              </button>
            </li>
          )}
        </ul>
      )}

      {error && (
        <p className="error" role="alert" style={{ fontSize: 12 }}>
          {error}
        </p>
      )}
    </div>
  );
}

// Map a root type string to one of the spectrum hues, deterministically by a
// stable hash so the same type always gets the same colour across the session.
// Documented choice: chips/lanes are coloured by ROOT TYPE (a sub-tag inherits
// the colour of its root). Null/unknown types fall back to --accent.
export function hueForType(type: string | null | undefined): string {
  if (!type) return "var(--accent)";
  let h = 0;
  for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) >>> 0;
  return `var(--hue-${(h % 6) + 1})`;
}
