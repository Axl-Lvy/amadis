"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";

import { sliceByCodePoint } from "@/lib/offsets";

import { createAnnotation, deleteAnnotation } from "./actions";
import styles from "./annotator.module.css";

type Tag = { id: string; layer: string; code: string; label: string | null };

type AnnotationView = {
  id: string;
  start: number;
  end: number;
  tagId: string;
  layer: string;
  code: string;
  label: string | null;
  note: string | null;
};

type Props = {
  texteId: string;
  content: string;
  tags: Tag[];
  annotations: AnnotationView[];
};

// Lane geometry (px). Bars sit in the line's leading, just below each glyph.
const ROW = 6;
const GAP = 5;

// Allow CSS custom properties in inline styles.
type Vars = CSSProperties & Record<`--${string}`, string>;

const isWordy = (ch: string) => /[\p{L}\p{M}'’-]/u.test(ch);

export function Annotator({ texteId, content, tags, annotations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const folioRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Stable colour per linguistic layer, drawn from the spectrum (--hue-1..6).
  const layers = useMemo(() => {
    const set = new Set<string>();
    tags.forEach((t) => set.add(t.layer));
    annotations.forEach((a) => set.add(a.layer));
    return [...set].sort();
  }, [tags, annotations]);
  const layerVar = (layer: string) =>
    `var(--hue-${((layers.indexOf(layer) + 6) % 6) + 1})`;

  const [activeLayer, setActiveLayer] = useState<string>(layers[0] ?? "");
  const tagsForLayer = useMemo(
    () => tags.filter((t) => t.layer === activeLayer),
    [tags, activeLayer],
  );
  const [tagId, setTagId] = useState<string>(tagsForLayer[0]?.id ?? "");
  const [note, setNote] = useState("");

  const [pending, setPending] = useState<{ start: number; end: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<{ left: number; top: number; bottom: number } | null>(null);

  // Which annotations are currently highlighted (hover coupling).
  const [lit, setLit] = useState<Set<string>>(() => new Set());

  const cps = useMemo(() => Array.from(content), [content]);

  // cover[i] = how many annotations cover code point i.
  const cover = useMemo(() => {
    const c = new Array(cps.length).fill(0);
    for (const a of annotations)
      for (let i = a.start; i < a.end && i < c.length; i++) c[i] += 1;
    return c;
  }, [annotations, cps.length]);

  // Greedy lane assignment so overlapping spans never share a lane.
  const { laneOf, laneCount } = useMemo(() => {
    const sorted = [...annotations].sort(
      (a, b) => a.start - b.start || a.end - a.start - (b.end - b.start),
    );
    const laneEnds: number[] = [];
    const map = new Map<string, number>();
    for (const a of sorted) {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] > a.start) lane++;
      laneEnds[lane] = a.end;
      map.set(a.id, lane);
    }
    return { laneOf: map, laneCount: laneEnds.length };
  }, [annotations]);

  const byLayerCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of annotations) m.set(a.layer, (m.get(a.layer) ?? 0) + 1);
    return m;
  }, [annotations]);

  function chooseLayer(layer: string) {
    setActiveLayer(layer);
    const first = tags.find((t) => t.layer === layer);
    setTagId(first?.id ?? "");
  }

  function onMouseUp() {
    const sel = window.getSelection();
    const folio = folioRef.current;
    if (!sel || sel.isCollapsed || !folio) return;
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
    setPending({ start: min, end: max + 1 });
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
  }

  // Clamp the floating toolbar inside the folio once its size is known.
  useLayoutEffect(() => {
    if (!pending || !anchorRef.current || !folioRef.current || !toolbarRef.current) {
      setPos(null);
      return;
    }
    const a = anchorRef.current;
    const w = folioRef.current.clientWidth;
    const tb = toolbarRef.current.getBoundingClientRect();
    const left = Math.max(4, Math.min(a.left, w - tb.width - 8));
    let top = a.top - tb.height - 10;
    if (top < 4) top = a.bottom + 10;
    setPos({ left, top });
  }, [pending]);

  function closeToolbar() {
    setPending(null);
    setPos(null);
    window.getSelection()?.removeAllRanges();
  }

  function addAnnotation() {
    if (!pending || !tagId) return;
    const fd = new FormData();
    fd.set("texteId", texteId);
    fd.set("tagId", tagId);
    fd.set("start", String(pending.start));
    fd.set("end", String(pending.end));
    if (note) fd.set("note", note);
    startTransition(async () => {
      await createAnnotation(fd);
      closeToolbar();
      setNote("");
      router.refresh();
    });
  }

  function removeAnnotation(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("texteId", texteId);
    startTransition(async () => {
      await deleteAnnotation(fd);
      router.refresh();
    });
  }

  const isLit = (id: string) => lit.has(id);

  // Annotations sorted for the inspector (by position, then layer).
  const sorted = useMemo(
    () =>
      [...annotations].sort(
        (a, b) =>
          a.start - b.start || layers.indexOf(a.layer) - layers.indexOf(b.layer),
      ),
    [annotations, layers],
  );

  // Pre-bucket code points into lines (newlines are counted but not rendered).
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

  function renderLine(items: { i: number; ch: string }[], lineNo: number) {
    const nodes: React.ReactNode[] = [];
    let run: { i: number; ch: string }[] = [];
    let runWordy = false;

    const flush = () => {
      if (!run.length) return;
      const wordy = runWordy;
      const cells = run.map(({ i, ch }) => {
        if (!wordy) {
          return (
            <span key={i} data-cp={i} data-cover={cover[i]}>
              {ch}
            </span>
          );
        }
        const here = annotations.filter((a) => a.start <= i && i < a.end);
        const litTop = [...here].reverse().find((a) => isLit(a.id));
        const cls = `${styles.cp}${litTop ? ` ${styles.lit}` : ""}`;
        const style = litTop
          ? ({ "--litc": layerVar(litTop.layer) } as Vars)
          : undefined;
        return (
          <span
            key={i}
            data-cp={i}
            data-cover={cover[i]}
            className={cls}
            style={style}
          >
            {ch}
            {renderBars(i, here)}
          </span>
        );
      });
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
        <span className={styles.ln}>{String(lineNo + 1).padStart(2, "0")}</span>
        {nodes}
      </span>
    );
  }

  function renderBars(i: number, here: AnnotationView[]) {
    if (!here.length) return null;
    return here.map((a) => {
      const lane = laneOf.get(a.id) ?? 0;
      const style = {
        "--c": layerVar(a.layer),
        top: `calc(100% + ${GAP + lane * ROW}px)`,
      } as Vars;
      // `grow` runs once when a bar's DOM node first mounts: existing bars keep
      // their node across a refresh (no replay), newly added bars animate in.
      const cls = [styles.bar, styles.grow, isLit(a.id) ? styles.lit : ""]
        .filter(Boolean)
        .join(" ");
      return <span key={a.id} className={cls} style={style} aria-hidden="true" />;
    });
  }

  const verseStyle = {
    lineHeight:
      laneCount > 0
        ? `calc(1.55em + ${2 * (GAP + laneCount * ROW + 2)}px)`
        : "1.85em",
  } as CSSProperties;

  const hasContent = cps.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {/* layer palette / legend */}
      <div className={styles.palette}>
        <span className={styles.paletteLead}>Layers</span>
        {layers.length === 0 && (
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            None yet — create a tag below.
          </span>
        )}
        {layers.map((layer) => (
          <button
            key={layer}
            type="button"
            className={styles.lyr}
            aria-pressed={layer === activeLayer}
            style={{ "--c": layerVar(layer) } as Vars}
            onClick={() => chooseLayer(layer)}
          >
            <span className={styles.dot} />
            {layer}
            <span className={styles.lyrCount}>{byLayerCount.get(layer) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className={styles.work}>
        <section className={styles.folio} ref={folioRef}>
          <div className={styles.eyebrow}>
            <b>Interlinear</b> · select a word or passage to gloss it · hover to trace
          </div>

          {hasContent ? (
            <p className={styles.verse} style={verseStyle} onMouseUp={onMouseUp}>
              {lines.map((items, idx) => renderLine(items, idx))}
            </p>
          ) : (
            <p className={styles.empty}>
              No transcription yet. Add content to this texte to annotate it.
            </p>
          )}

          <div className={styles.foot}>
            <span>NFC · code-point offsets · [start, end)</span>
            <span>{cps.length} code points</span>
          </div>

          {pending && (
            <div
              ref={toolbarRef}
              className={styles.inscribe}
              role="dialog"
              aria-label="Inscribe a gloss"
              style={{
                left: pos?.left ?? -9999,
                top: pos?.top ?? -9999,
                visibility: pos ? "visible" : "hidden",
              }}
            >
              {layers.length === 0 ? (
                <span className={styles.hintInline}>Create a tag first to gloss.</span>
              ) : (
                <>
                  <div className={styles.inscribeLayers}>
                    {layers.map((layer) => (
                      <button
                        key={layer}
                        type="button"
                        className={styles.lb}
                        title={layer}
                        aria-pressed={layer === activeLayer}
                        style={{ "--c": layerVar(layer) } as Vars}
                        onClick={() => chooseLayer(layer)}
                      >
                        <span className={styles.sw} />
                      </button>
                    ))}
                  </div>
                  <span className={styles.sep2} />
                  <select
                    className={styles.tagSelect}
                    value={tagId}
                    onChange={(e) => setTagId(e.target.value)}
                    aria-label="Tag"
                  >
                    {tagsForLayer.length === 0 && <option value="">no tag</option>}
                    {tagsForLayer.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code}
                        {t.label ? ` — ${t.label}` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    className={styles.noteInput}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="note (optional)"
                  />
                  <button
                    type="button"
                    className={styles.go}
                    style={{ "--c": layerVar(activeLayer) } as Vars}
                    disabled={isPending || !tagId}
                    onClick={addAnnotation}
                  >
                    Inscribe
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ padding: "8px 11px" }}
                    onClick={closeToolbar}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* inspector */}
        <aside className={styles.inspector}>
          <p className={`section-label ${styles.inspectorHead}`}>
            Apparatus · {annotations.length}
          </p>
          <div className={styles.chips}>
            {sorted.length === 0 && (
              <div className={styles.emptyInspector}>
                No glosses yet. Select text and pick a colour — each annotation lands on
                its own lane below the line.
              </div>
            )}
            {sorted.map((a) => {
              const src = sliceByCodePoint(content, a.start, a.end);
              const style = { "--c": layerVar(a.layer) } as Vars;
              return (
                <div
                  key={a.id}
                  className={`${styles.chip} ${isLit(a.id) ? styles.lit : ""}`}
                  style={style}
                  onMouseEnter={() => setLit(new Set([a.id]))}
                  onMouseLeave={() => setLit(new Set())}
                >
                  <span className={styles.dot} />
                  <div className={styles.chipBody}>
                    <div className={styles.chipSrc}>{src}</div>
                    <div className={styles.chipVal}>
                      <span className={styles.code}>{a.code}</span>{" "}
                      <span className={styles.layerName}>· {a.layer}</span>
                      {a.note ? ` — ${a.note}` : ""}
                    </div>
                    <div className={styles.off}>
                      [{a.start}, {a.end})
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.del}
                    aria-label="Remove gloss"
                    disabled={isPending}
                    onClick={() => removeAnnotation(a.id)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
