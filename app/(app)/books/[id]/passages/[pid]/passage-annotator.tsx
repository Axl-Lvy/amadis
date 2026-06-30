"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { hueForType, TagTreePicker } from "@/app/_components/tag-tree-picker";
import { sliceByCodePoint } from "@/lib/offsets";
import { tagPath, type TagNode } from "@/lib/tag-tree";

import {
  createPlacement,
  createRef,
  deletePlacement,
  deleteRef,
  listRefsForPlacement,
  searchMentionTargets,
  updatePlacement,
  type RefView,
} from "./annotator-actions";
import styles from "./passage-annotator.module.css";

// ---------------------------------------------------------------------------
// Prop contract (mounted by the integrator's passage page).
// ---------------------------------------------------------------------------

type PlacementField = "TITLE" | "TEXT";

export type PlacementView = {
  id: string;
  field: PlacementField;
  start: number;
  end: number;
  description: string | null;
  tagIds: string[];
};

export type PassageAnnotatorProps = {
  passage: { id: string; title: string; text: string };
  bookId: string;
  tags: TagNode[];
  placements: PlacementView[];
};

// ---------------------------------------------------------------------------
// Mention tokens.
//
// A description can reference another span / passage / variant. We store the
// reference inline in the description text as a self-contained token:
//
//     @[label](TYPE:targetId)
//
// where TYPE ∈ PLACEMENT | PASSAGE | VARIANT and targetId is the target's id.
// The token is self-describing (carries its own display label and target) so
// the description renders correctly even before the PlacementRef rows load, and
// each token maps 1:1 to a PlacementRef matched by (targetType, targetId). On
// save we persist one createRef per distinct token; removing a chip both strips
// its token from the description and deletes the matching ref.
// ---------------------------------------------------------------------------

const MENTION_RE = /@\[([^\]]*)\]\((PLACEMENT|PASSAGE|VARIANT):([^)]+)\)/g;

type RefTargetType = "PLACEMENT" | "PASSAGE" | "VARIANT";

function mentionToken(type: RefTargetType, targetId: string, label: string): string {
  // Strip characters that would break the token grammar from the label.
  const safe = label.replace(/[\]()]/g, " ").replace(/\s+/g, " ").trim();
  return `@[${safe}](${type}:${targetId})`;
}

// Parse a description into a sequence of plain-text and mention segments. Each
// segment carries its `start` character offset, which gives every segment a
// stable React key without relying on the array index.
type Segment =
  | { kind: "text"; text: string; start: number }
  | { kind: "mention"; type: RefTargetType; targetId: string; label: string; start: number };

function parseDescription(description: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const m of description.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ kind: "text", text: description.slice(last, idx), start: last });
    segments.push({
      kind: "mention",
      label: m[1],
      type: m[2] as RefTargetType,
      targetId: m[3],
      start: idx,
    });
    last = idx + m[0].length;
  }
  if (last < description.length) {
    segments.push({ kind: "text", text: description.slice(last), start: last });
  }
  return segments;
}

// Distinct (type,targetId) mentions present in a description.
function mentionsIn(description: string): { type: RefTargetType; targetId: string }[] {
  const out: { type: RefTargetType; targetId: string }[] = [];
  const seen = new Set<string>();
  for (const m of description.matchAll(MENTION_RE)) {
    const key = `${m[2]}:${m[3]}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ type: m[2] as RefTargetType, targetId: m[3] });
    }
  }
  return out;
}

const refKey = (type: RefTargetType, targetId: string) => `${type}:${targetId}`;

// Drop the current text selection (used when a folio panel closes). Module scope
// — it closes over nothing.
function clearSelection() {
  globalThis.getSelection()?.removeAllRanges();
}

type Hrefs = Map<string, { href: string; exists: boolean }>;

// Render a description, turning mention tokens into navigable chips. The href
// comes from the resolved-refs map; an unresolved/deleted target renders as a
// struck-through dead link (no navigation). Keys are derived from each segment's
// position in the description (not the array index).
function DescriptionText({ description, hrefs }: Readonly<{ description: string; hrefs: Hrefs }>) {
  const t = useTranslations("annotator");
  const segments = parseDescription(description);
  return (
    <>
      {segments.map((seg) => {
        const key = `${seg.kind}-${seg.start}`;
        if (seg.kind === "text") {
          return <span key={key}>{seg.text}</span>;
        }
        const resolved = hrefs.get(refKey(seg.type, seg.targetId));
        if (resolved?.exists && resolved.href !== "#") {
          return (
            <a key={key} href={resolved.href} className={styles.descMention}>
              @{seg.label}
            </a>
          );
        }
        return (
          <span key={key} className={styles.descMentionDead} title={t("mention.deadTarget")}>
            @{seg.label}
          </span>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Geometry.
// ---------------------------------------------------------------------------

const ROW = 6;
const GAP = 5;

type Vars = CSSProperties & Record<`--${string}`, string>;

const richTags = { b: (chunks: ReactNode) => <b>{chunks}</b> };
const isWordy = (ch: string) => /[\p{L}\p{M}'’-]/u.test(ch);

// A pending selection awaiting inscription, or an existing placement being edited.
type Editing =
  | { mode: "create"; field: PlacementField; start: number; end: number }
  | { mode: "edit"; field: PlacementField; start: number; end: number; id: string };

export function PassageAnnotator({
  passage,
  bookId,
  tags,
  placements,
}: Readonly<PassageAnnotatorProps>) {
  const t = useTranslations("annotator");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // NFC-normalize both fields once at the boundary so offsets are stable.
  const title = useMemo(() => passage.title.normalize("NFC"), [passage.title]);
  const text = useMemo(() => passage.text.normalize("NFC"), [passage.text]);

  const tagsById = useMemo(() => {
    const m = new Map<string, TagNode>();
    for (const node of tags) m.set(node.id, node);
    return m;
  }, [tags]);

  // Root-type colour for a tag id (first tag wins for a placement's lane).
  const hueForTag = useCallback(
    (tagId: string): string => {
      const path = tagPath(tagsById, tagId);
      const root = path[0];
      return hueForType(root?.type ?? null);
    },
    [tagsById],
  );

  const colorOf = useCallback(
    (p: PlacementView): string => (p.tagIds[0] ? hueForTag(p.tagIds[0]) : "var(--muted)"),
    [hueForTag],
  );

  const fullPath = useCallback(
    (tagId: string): string => {
      const path = tagPath(tagsById, tagId);
      return path.length ? path.map((n) => n.name).join(" › ") : t("unknownTag");
    },
    [tagsById, t],
  );

  const [editing, setEditing] = useState<Editing | null>(null);
  const [lit, setLit] = useState<string | null>(null);

  // Close the inscribe panel: drop the panel state AND the native text selection.
  // (Folio's render-prop `close` only clears the selection; the panel is gated on
  // `editing`, so it must be reset here or the dialog can never be dismissed.)
  const closePanel = useCallback(() => {
    setEditing(null);
    clearSelection();
  }, []);

  // Resolved mention targets (href + existence) for the inspector's chips,
  // keyed by `${type}:${targetId}`. We load the refs of every placement whose
  // description carries a mention; resolveTarget (via listRefsForPlacement) gives
  // each a deep link. A target deleted out from under a stale ref resolves to
  // exists:false and renders as a struck-through dead link.
  const [hrefs, setHrefs] = useState<Map<string, { href: string; exists: boolean }>>(
    () => new Map(),
  );
  useEffect(() => {
    let active = true;
    // mentionsIn uses matchAll (no shared lastIndex), so this stays correct
    // regardless of the module-level regex's state. The resolve runs in an async
    // task (state is only set after an await), so no synchronous setState here.
    const withMentions = placements.filter(
      (p) => p.description && mentionsIn(p.description).length > 0,
    );
    (async () => {
      const lists = await Promise.all(withMentions.map((p) => listRefsForPlacement(p.id)));
      if (!active) return;
      const next = new Map<string, { href: string; exists: boolean }>();
      for (const list of lists) {
        for (const ref of list) {
          next.set(refKey(ref.targetType, ref.targetId), {
            href: ref.resolved.href,
            exists: ref.resolved.exists,
          });
        }
      }
      setHrefs(next);
    })();
    return () => {
      active = false;
    };
  }, [placements]);

  return (
    <div className="flex flex-col gap-4">
      <div className={styles.work}>
        <div className={styles.folios}>
          <Folio
            field="TITLE"
            label={t("folio.title")}
            content={title}
            placements={placements.filter((p) => p.field === "TITLE")}
            colorOf={colorOf}
            lit={lit}
            setLit={setLit}
            onSelect={(start, end) => setEditing({ mode: "create", field: "TITLE", start, end })}
            editing={editing?.field === "TITLE" ? editing : null}
            renderPanel={() => (
              <InscribePanel
                key={editing?.mode === "edit" ? editing.id : "create-title"}
                bookId={bookId}
                passageId={passage.id}
                tags={tags}
                fieldText={title}
                editing={editing!}
                existing={placements}
                onDone={() => {
                  closePanel();
                  startTransition(() => router.refresh());
                }}
                onCancel={closePanel}
              />
            )}
          />
          <Folio
            field="TEXT"
            label={t("folio.text")}
            content={text}
            placements={placements.filter((p) => p.field === "TEXT")}
            colorOf={colorOf}
            lit={lit}
            setLit={setLit}
            onSelect={(start, end) => setEditing({ mode: "create", field: "TEXT", start, end })}
            editing={editing?.field === "TEXT" ? editing : null}
            renderPanel={() => (
              <InscribePanel
                key={editing?.mode === "edit" ? editing.id : "create-text"}
                bookId={bookId}
                passageId={passage.id}
                tags={tags}
                fieldText={text}
                editing={editing!}
                existing={placements}
                onDone={() => {
                  closePanel();
                  startTransition(() => router.refresh());
                }}
                onCancel={closePanel}
              />
            )}
          />
        </div>

        {/* inspector across both fields */}
        <aside className={styles.inspector}>
          <p className={`section-label ${styles.inspectorHead}`}>
            {t("inspector.title", { count: placements.length })}
          </p>
          <div className={styles.chips}>
            {placements.length === 0 && (
              <div className={styles.emptyInspector}>{t("inspector.empty")}</div>
            )}
            {placements.map((p) => {
              const src = sliceByCodePoint(p.field === "TITLE" ? title : text, p.start, p.end);
              const c = colorOf(p);
              return (
                <div
                  key={p.id}
                  className={`${styles.chip} ${lit === p.id ? styles.lit : ""}`}
                  style={{ "--c": c } as Vars}
                  onMouseEnter={() => setLit(p.id)}
                  onMouseLeave={() => setLit(null)}
                >
                  <div className={styles.chipTop}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: 4,
                        background: "var(--c)",
                        marginTop: 4,
                      }}
                    />
                    <div className={styles.chipBody}>
                      <div className={styles.chipSrc}>
                        {src || <span className="muted">{t("inspector.emptySpan")}</span>}{" "}
                        <span className={styles.fieldBadge}>
                          {p.field === "TITLE" ? t("folio.title") : t("folio.text")}
                        </span>
                      </div>
                      {p.tagIds.length > 0 && (
                        <div className={styles.tagPaths} style={{ marginTop: 4 }}>
                          {p.tagIds.map((id) => (
                            <span
                              key={id}
                              className={styles.tagPath}
                              style={{ "--c": hueForTag(id) } as Vars}
                            >
                              {fullPath(id)}
                            </span>
                          ))}
                        </div>
                      )}
                      {p.description && (
                        <p className={styles.desc} style={{ marginTop: 5 }}>
                          <DescriptionText description={p.description} hrefs={hrefs} />
                        </p>
                      )}
                      <div className={styles.off}>
                        [{p.start}, {p.end})
                      </div>
                    </div>
                    <div className={styles.chipActions}>
                      <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label={t("inspector.edit")}
                        disabled={isPending}
                        onClick={() =>
                          setEditing({
                            mode: "edit",
                            field: p.field,
                            start: p.start,
                            end: p.end,
                            id: p.id,
                          })
                        }
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconBtn} ${styles.del}`}
                        aria-label={t("inspector.remove")}
                        disabled={isPending}
                        onClick={() =>
                          startTransition(async () => {
                            await deletePlacement(bookId, passage.id, p.id);
                            router.refresh();
                          })
                        }
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      <div aria-live="polite" className="sr-only">
        {isPending ? tc("loading") : ""}
      </div>
      <style>{`.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;}`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Folio — one selectable field (title or text) with interlinear lanes.
// ---------------------------------------------------------------------------

type FolioProps = {
  field: PlacementField;
  label: string;
  content: string;
  placements: PlacementView[];
  colorOf: (p: PlacementView) => string;
  lit: string | null;
  setLit: (id: string | null) => void;
  onSelect: (start: number, end: number) => void;
  editing: Editing | null;
  renderPanel: (close: () => void) => ReactNode;
};

function Folio({
  field,
  label,
  content,
  placements,
  colorOf,
  lit,
  setLit,
  onSelect,
  editing,
  renderPanel,
}: Readonly<FolioProps>) {
  const t = useTranslations("annotator");
  const folioRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<{ left: number; top: number; bottom: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const cps = useMemo(() => Array.from(content), [content]);

  // cover[i] = number of placements covering code point i (this field only).
  const cover = useMemo(() => {
    const c = new Array(cps.length).fill(0);
    for (const p of placements)
      for (let i = p.start; i < p.end && i < c.length; i++) c[i] += 1;
    return c;
  }, [placements, cps.length]);

  // Greedy lane assignment so overlapping spans never share a lane.
  const { laneOf, laneCount } = useMemo(() => {
    const sorted = [...placements].sort(
      (a, b) => a.start - b.start || a.end - a.start - (b.end - b.start),
    );
    const laneEnds: number[] = [];
    const map = new Map<string, number>();
    for (const p of sorted) {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > p.start) lane++;
      laneEnds[lane] = p.end;
      map.set(p.id, lane);
    }
    return { laneOf: map, laneCount: laneEnds.length };
  }, [placements]);

  // Mouse-driven code-point selection over this folio's glyph cells.
  useEffect(() => {
    const folio = folioRef.current;
    if (!folio) return;
    const onMouseUp = () => {
      const sel = globalThis.getSelection();
      if (!sel || sel.isCollapsed) return;
      // Ignore a drag that starts or ends outside this folio (e.g. one that
      // crosses from the title folio into the text folio) so a span is only ever
      // inscribed from an in-folio selection.
      if (!folio.contains(sel.anchorNode) || !folio.contains(sel.focusNode)) return;
      let min = Infinity;
      let max = -1;
      folio.querySelectorAll<HTMLElement>("[data-cp]").forEach((el) => {
        if (sel.containsNode(el, true)) {
          const cp = Number(el.dataset.cp);
          if (cp < min) min = cp;
          if (cp > max) max = cp;
        }
      });
      if (max < 0) return;
      const first = folio.querySelector<HTMLElement>(`[data-cp="${min}"]`);
      if (first) {
        const fr = folio.getBoundingClientRect();
        const r = first.getBoundingClientRect();
        anchorRef.current = {
          left: r.left - fr.left,
          top: r.top - fr.top,
          bottom: r.bottom - fr.top,
        };
      }
      onSelect(min, max + 1);
    };
    folio.addEventListener("mouseup", onMouseUp);
    return () => folio.removeEventListener("mouseup", onMouseUp);
  }, [onSelect]);

  // When editing an existing placement in this field, anchor the panel to its start.
  useEffect(() => {
    if (editing?.mode !== "edit") return;
    const folio = folioRef.current;
    if (!folio) return;
    // Anchor to the placement's start cell; if it is gone (e.g. the text was
    // shortened below a stale offset), fall back to the first cell so the panel
    // still appears in view rather than off-screen.
    const first =
      folio.querySelector<HTMLElement>(`[data-cp="${editing.start}"]`) ??
      folio.querySelector<HTMLElement>("[data-cp]");
    if (first) {
      const fr = folio.getBoundingClientRect();
      const r = first.getBoundingClientRect();
      anchorRef.current = {
        left: r.left - fr.left,
        top: r.top - fr.top,
        bottom: r.bottom - fr.top,
      };
    }
  }, [editing]);

  // Clamp the floating panel inside the folio once its size is known.
  useLayoutEffect(() => {
    if (!editing || !anchorRef.current || !folioRef.current || !panelRef.current) {
      setPos(null);
      return;
    }
    const a = anchorRef.current;
    const w = folioRef.current.clientWidth;
    const tb = panelRef.current.getBoundingClientRect();
    const left = Math.max(4, Math.min(a.left, w - tb.width - 8));
    let top = a.bottom + 10;
    if (top + tb.height > folioRef.current.clientHeight + window.innerHeight) {
      top = Math.max(4, a.top - tb.height - 10);
    }
    setPos({ left, top });
  }, [editing]);

  // Pre-bucket code points into lines (newlines counted, not rendered).
  const lines = useMemo(() => {
    const out: { i: number; ch: string }[][] = [];
    let cur: { i: number; ch: string }[] = [];
    cps.forEach((ch, i) => {
      if (ch === "\n") {
        out.push(cur);
        cur = [];
      } else {
        cur.push({ i, ch });
      }
    });
    out.push(cur);
    return out;
  }, [cps]);

  const isLit = (id: string) => lit === id;

  function renderBars(i: number, here: PlacementView[]) {
    if (!here.length) return null;
    return here.map((p) => {
      const lane = laneOf.get(p.id) ?? 0;
      const style = {
        "--c": colorOf(p),
        top: `calc(100% + ${GAP + lane * ROW}px)`,
      } as Vars;
      const cls = [styles.bar, styles.grow, isLit(p.id) ? styles.lit : ""]
        .filter(Boolean)
        .join(" ");
      return (
        <span
          key={p.id}
          className={cls}
          style={style}
          aria-hidden="true"
          onMouseEnter={() => setLit(p.id)}
          onMouseLeave={() => setLit(null)}
        />
      );
    });
  }

  function renderCell(i: number, ch: string, wordy: boolean) {
    const here = placements.filter((p) => p.start <= i && i < p.end);
    if (!wordy) {
      return (
        <span key={i} data-cp={i} data-cover={cover[i]}>
          {ch}
        </span>
      );
    }
    const litTop = [...here].reverse().find((p) => isLit(p.id));
    const cls = litTop ? `${styles.cp} ${styles.lit}` : styles.cp;
    const style = litTop ? ({ "--litc": colorOf(litTop) } as Vars) : undefined;
    return (
      <span key={i} data-cp={i} data-cover={cover[i]} className={cls} style={style}>
        {ch}
        {renderBars(i, here)}
      </span>
    );
  }

  function renderLine(items: { i: number; ch: string }[], lineNo: number, multiline: boolean) {
    const nodes: ReactNode[] = [];
    let run: { i: number; ch: string }[] = [];
    let runWordy = false;

    const flush = () => {
      if (!run.length) return;
      const wordy = runWordy;
      const cells = run.map(({ i, ch }) => renderCell(i, ch, wordy));
      nodes.push(
        runWordy ? (
          <span key={`w${run[0].i}`} className={styles.word}>
            {cells}
          </span>
        ) : (
          <span key={`s${run[0].i}`} className={styles.sep}>
            {cells}
          </span>
        ),
      );
      run = [];
    };

    items.forEach((it) => {
      const w = isWordy(it.ch);
      if (run.length && w !== runWordy) flush();
      runWordy = w;
      run.push(it);
    });
    flush();

    return (
      <span key={`l${lineNo}`} className={styles.vline}>
        {multiline && (
          <span className={styles.ln}>{String(lineNo + 1).padStart(2, "0")}</span>
        )}
        {nodes}
      </span>
    );
  }

  const verseStyle = {
    lineHeight:
      laneCount > 0 ? `calc(1.55em + ${2 * (GAP + laneCount * ROW + 2)}px)` : "1.85em",
  } as CSSProperties;

  const hasContent = cps.length > 0;
  const multiline = lines.length > 1;

  return (
    <section className={styles.folio} ref={folioRef}>
      <div className={styles.eyebrow}>{label}</div>
      {hasContent ? (
        <p className={`${styles.verse} ${field === "TITLE" ? styles.verseTitle : styles.verseText}`} style={verseStyle}>
          {lines.map((items, idx) => renderLine(items, idx, multiline))}
        </p>
      ) : (
        <p className={styles.empty}>{t("folio.noContent")}</p>
      )}
      <div className={styles.foot}>
        <span>{t.rich("foot.convention", richTags)}</span>
        <span>{t("foot.codePoints", { count: cps.length })}</span>
      </div>

      {editing && (
        <div
          ref={panelRef}
          style={{
            position: "absolute",
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            visibility: pos ? "visible" : "hidden",
            zIndex: 40,
          }}
        >
          {renderPanel(clearSelection)}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// InscribePanel — tag picker + description + mention affordance for one
// placement (create or edit). On save, creates/updates the placement, then
// reconciles its cross-reference rows with the mention tokens in the text.
// ---------------------------------------------------------------------------

type InscribePanelProps = {
  bookId: string;
  passageId: string;
  tags: TagNode[];
  fieldText: string;
  editing: Editing;
  existing: PlacementView[];
  onDone: () => void;
  onCancel: () => void;
};

function InscribePanel({
  bookId,
  passageId,
  tags,
  fieldText,
  editing,
  existing,
  onDone,
  onCancel,
}: Readonly<InscribePanelProps>) {
  const t = useTranslations("annotator");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  const seed = editing.mode === "edit" ? existing.find((p) => p.id === editing.id) : undefined;

  const [tagIds, setTagIds] = useState<string[]>(seed?.tagIds ?? []);
  const [description, setDescription] = useState<string>(seed?.description ?? "");
  const [error, setError] = useState<string | null>(null);

  // Existing refs of the placement being edited (so removing a chip can delete
  // the matching ref). Keyed by `${type}:${targetId}`. `refsLoaded` gates Save in
  // edit mode so reconciliation never runs against an empty (not-yet-loaded) set
  // and drops a ref deletion. (createRef is also idempotent server-side.)
  const [refs, setRefs] = useState<RefView[]>([]);
  const [refsLoaded, setRefsLoaded] = useState(editing.mode !== "edit");
  useEffect(() => {
    if (editing.mode !== "edit") return;
    let active = true;
    listRefsForPlacement(editing.id).then((r) => {
      if (active) {
        setRefs(r);
        setRefsLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [editing]);

  // Mention search UI state.
  const [pickingMention, setPickingMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState<
    { type: RefTargetType; id: string; label: string; context: string }[]
  >([]);

  useEffect(() => {
    if (!pickingMention) return;
    let active = true;
    const handle = setTimeout(async () => {
      const results = await searchMentionTargets(mentionQuery, 20);
      // Don't allow a placement to mention itself.
      const filtered =
        editing.mode === "edit"
          ? results.filter((r) => !(r.type === "PLACEMENT" && r.id === editing.id))
          : results;
      if (active) setMentionResults(filtered);
    }, 160);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [pickingMention, mentionQuery, editing]);

  function insertMention(c: { type: RefTargetType; id: string; label: string }) {
    const token = mentionToken(c.type, c.id, c.label);
    setDescription((d) => (d ? `${d.trimEnd()} ${token} ` : `${token} `));
    setPickingMention(false);
    setMentionQuery("");
    setMentionResults([]);
  }

  function removeMention(type: RefTargetType, targetId: string) {
    setDescription((d) =>
      d
        .replace(MENTION_RE, (full, _label, ty, id) =>
          ty === type && id === targetId ? "" : full,
        )
        .replace(/\s{2,}/g, " ")
        .trim(),
    );
  }

  // Chips for the mentions currently present in the description text.
  const draftMentions = useMemo(() => {
    const segs = parseDescription(description);
    const seen = new Set<string>();
    const out: { type: RefTargetType; targetId: string; label: string }[] = [];
    for (const s of segs) {
      if (s.kind === "mention") {
        const key = `${s.type}:${s.targetId}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ type: s.type, targetId: s.targetId, label: s.label });
        }
      }
    }
    return out;
  }, [description]);

  // Create or update the placement; returns its id, or null after surfacing an error.
  async function persistPlacement(cleanDesc: string): Promise<string | null> {
    if (editing.mode === "create") {
      const res = await createPlacement(bookId, {
        passageId,
        field: editing.field,
        start: editing.start,
        end: editing.end,
        tagIds,
        description: cleanDesc || null,
      });
      if (!res.ok) {
        setError(res.error);
        return null;
      }
      return res.id;
    }
    const res = await updatePlacement(bookId, passageId, editing.id, {
      tagIds,
      description: cleanDesc || null,
    });
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    return editing.id;
  }

  // Reconcile PlacementRef rows with the mention tokens in the description:
  // create newly-added mentions (createRef is idempotent), delete removed ones.
  // Returns false after surfacing an error.
  async function reconcileRefs(placementId: string, cleanDesc: string): Promise<boolean> {
    const wanted = mentionsIn(cleanDesc);
    const have = new Set(refs.map((r) => refKey(r.targetType, r.targetId)));
    const want = new Set(wanted.map((m) => refKey(m.type, m.targetId)));

    for (const m of wanted) {
      if (have.has(refKey(m.type, m.targetId))) continue;
      const r = await createRef(bookId, passageId, {
        sourceId: placementId,
        targetType: m.type,
        targetId: m.targetId,
      });
      if (!r.ok) {
        setError(r.error);
        return false;
      }
    }
    for (const r of refs) {
      if (want.has(refKey(r.targetType, r.targetId))) continue;
      const d = await deleteRef(bookId, passageId, r.id);
      if (!d.ok) {
        setError(d.error);
        return false;
      }
    }
    return true;
  }

  function save() {
    setError(null);
    // In edit mode, wait for the existing refs to load so reconciliation can see
    // which ones to delete (the button is also disabled until then).
    if (editing.mode === "edit" && !refsLoaded) return;
    const cleanDesc = description.trim();
    if (tagIds.length === 0 && !cleanDesc) {
      setError(t("panel.requireOne"));
      return;
    }
    startTransition(async () => {
      const placementId = await persistPlacement(cleanDesc);
      if (placementId === null) return;
      if (await reconcileRefs(placementId, cleanDesc)) onDone();
    });
  }

  const src = sliceByCodePoint(fieldText, editing.start, editing.end);

  return (
    <dialog
      open
      className={styles.inscribe}
      aria-label={t("panel.ariaLabel")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <div className={styles.inscribeHead}>
        <span className={styles.inscribeTitle}>
          {editing.mode === "edit" ? t("panel.editTitle") : t("panel.createTitle")}
        </span>
        <span className={styles.inscribeSrc} title={src}>
          {src || t("inspector.emptySpan")}
        </span>
      </div>

      <div className={styles.pickerHost}>
        <TagTreePicker value={tagIds} onChange={setTagIds} allTags={tags} />
      </div>

      <textarea
        className={styles.descArea}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t("panel.descPlaceholder")}
        aria-label={t("panel.descLabel")}
      />

      {/* mention chips currently in the description */}
      {draftMentions.length > 0 && (
        <div className={styles.mentionRow}>
          {draftMentions.map((m) => (
            <span key={`${m.type}:${m.targetId}`} className={styles.mentionPill}>
              <span className="lbl">@{m.label}</span>
              <button
                type="button"
                onClick={() => removeMention(m.type, m.targetId)}
                aria-label={t("panel.removeMention", { label: m.label })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.mentionRow}>
        <button
          type="button"
          className={styles.smallBtn}
          onClick={() => setPickingMention((v) => !v)}
          aria-expanded={pickingMention}
        >
          {t("panel.addMention")}
        </button>
      </div>

      {pickingMention && (
        <div className={styles.mentionSearch}>
          <input
            value={mentionQuery}
            onChange={(e) => setMentionQuery(e.target.value)}
            placeholder={t("panel.mentionSearchPlaceholder")}
            aria-label={t("panel.mentionSearchPlaceholder")}
            autoFocus
          />
          <ul className={styles.mentionResults}>
            {mentionResults.length === 0 && (
              <li className="muted" style={{ fontSize: 12, padding: "4px 8px" }}>
                {t("panel.mentionNoResults")}
              </li>
            )}
            {mentionResults.map((c) => (
              <li key={`${c.type}:${c.id}`}>
                <button
                  type="button"
                  className={styles.mentionResult}
                  onClick={() => insertMention(c)}
                >
                  <span className="kind">{t(`mention.${c.type}`)}</span>
                  <span>{c.label}</span>
                  <span className="ctx">{c.context}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className={styles.panelError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.panelActions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={isPending}>
          {tc("cancel")}
        </button>
        <button
          type="button"
          className={styles.go}
          onClick={save}
          disabled={isPending || (editing.mode === "edit" && !refsLoaded)}
        >
          {editing.mode === "edit" ? tc("save") : t("panel.inscribe")}
        </button>
      </div>
    </dialog>
  );
}
