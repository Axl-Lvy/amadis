"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { sliceByCodePoint } from "@/lib/offsets";

import { createAnnotation, deleteAnnotation } from "./actions";

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

// Background intensity grows with how many annotations cover a character,
// which makes overlapping spans visible.
function coverClass(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "bg-yellow-200/70 dark:bg-yellow-500/30";
  if (count === 2) return "bg-orange-300/70 dark:bg-orange-500/40";
  return "bg-red-300/80 dark:bg-red-500/50";
}

export function Annotator({ texteId, content, tags, annotations }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  const [pending, setPending] = useState<{ start: number; end: number } | null>(null);
  const [tagId, setTagId] = useState<string>(tags[0]?.id ?? "");
  const [note, setNote] = useState("");

  // One element per code point. Index is the code-point offset, so selection and
  // highlighting both work directly in code-point space (start incl, end excl).
  const chars = useMemo(() => Array.from(content), [content]);

  // For each code point, how many annotations cover it.
  const cover = useMemo(() => {
    const counts = new Array(chars.length).fill(0);
    for (const a of annotations) {
      for (let i = a.start; i < a.end && i < counts.length; i++) counts[i] += 1;
    }
    return counts;
  }, [annotations, chars.length]);

  function onMouseUp() {
    const sel = window.getSelection();
    const container = containerRef.current;
    if (!sel || sel.isCollapsed || !container) {
      return;
    }
    let min = Infinity;
    let max = -1;
    container.querySelectorAll<HTMLElement>("[data-cp]").forEach((span) => {
      if (sel.containsNode(span, true)) {
        const cp = Number(span.dataset.cp);
        if (cp < min) min = cp;
        if (cp > max) max = cp;
      }
    });
    if (max < 0) {
      return;
    }
    setPending({ start: min, end: max + 1 });
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
      setPending(null);
      setNote("");
      window.getSelection()?.removeAllRanges();
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

  const pendingText = pending
    ? sliceByCodePoint(content, pending.start, pending.end)
    : "";

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={containerRef}
        onMouseUp={onMouseUp}
        className="select-text whitespace-pre-wrap break-words rounded-md border border-black/15 p-4 font-serif text-lg leading-relaxed dark:border-white/20"
      >
        {chars.length === 0 ? (
          <span className="text-sm italic opacity-60">
            No transcription yet. Add content to this texte to annotate it.
          </span>
        ) : (
          chars.map((ch, i) => {
            const inPending = pending != null && i >= pending.start && i < pending.end;
            return (
              <span
                key={i}
                data-cp={i}
                className={`${coverClass(cover[i])} ${inPending ? "ring-2 ring-blue-500" : ""}`}
              >
                {ch}
              </span>
            );
          })
        )}
      </div>

      {pending && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-blue-500/40 bg-blue-50 p-3 text-sm dark:bg-blue-950/30">
          <span>
            Span [{pending.start}, {pending.end}):{" "}
            <span className="font-mono font-semibold">
              {JSON.stringify(pendingText)}
            </span>
          </span>
          <select
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-black"
          >
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.layer}:{t.code}
                {t.label ? ` (${t.label})` : ""}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="note (optional)"
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-black"
          />
          <button
            type="button"
            disabled={isPending || !tagId}
            onClick={addAnnotation}
            className="rounded-md bg-black px-3 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setPending(null);
              window.getSelection()?.removeAllRanges();
            }}
            className="rounded-md border border-black/15 px-3 py-1 dark:border-white/20"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Annotations ({annotations.length})
        </h3>
        <ul className="flex flex-col gap-1 text-sm">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-2 dark:border-white/15"
            >
              <span>
                <span className="font-mono">
                  [{a.start},{a.end})
                </span>{" "}
                <span className="font-semibold">
                  {a.layer}:{a.code}
                </span>{" "}
                <span className="font-mono opacity-70">
                  {JSON.stringify(sliceByCodePoint(content, a.start, a.end))}
                </span>
                {a.note ? <span className="opacity-60"> — {a.note}</span> : null}
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => removeAnnotation(a.id)}
                className="rounded-md border border-black/15 px-2 py-0.5 text-xs opacity-70 disabled:opacity-40 dark:border-white/20"
              >
                Delete
              </button>
            </li>
          ))}
          {annotations.length === 0 && (
            <li className="opacity-60">None yet. Select text above and assign a tag.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
