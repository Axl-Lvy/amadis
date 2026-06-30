"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

let tmpMarkSeq = 0;

import { PdfPages } from "@/app/_components/pdf-document";
import type { PdfGeometry, PdfPoint } from "@/app/_components/pdf-document";
import { areaBounds, columnTranslate, focus } from "@/lib/pdf-areas";
import type { MarkPoint } from "@/lib/pdf-areas";
import type { TagNode } from "@/lib/tag-tree";

import {
  addMarkAction,
  attachBookPdfAction,
  moveMarkAction,
  presignBookPdfUploadAction,
  removeMarkAction,
  updatePassageAction,
} from "./actions";
import {
  PassageAnnotator,
  type PlacementView,
} from "./passages/[pid]/passage-annotator";

export type PdfMark = { id: string; page: number; frac: number };
export type PdfPassage = {
  id: string;
  number: number;
  title: string;
  text: string;
  tags: TagNode[];
  placements: PlacementView[];
};

type Props = {
  bookId: string;
  hasPdf: boolean;
  marks: PdfMark[];
  passages: PdfPassage[];
};

const BOX_H = 560; // BIG fixed transcription-box height (px)
const BOX_GAP = 24;

export function BookPdf({ bookId, hasPdf, marks, passages }: Readonly<Props>) {
  const t = useTranslations("pdf");

  if (!hasPdf) {
    return (
      <div className="flex flex-col gap-3">
        <p className="muted" style={{ fontSize: 13 }}>
          {t("noPdf")}
        </p>
        <PdfUploader bookId={bookId} />
        <PassagesColumn bookId={bookId} passages={passages} />
      </div>
    );
  }

  return <PdfView bookId={bookId} marks={marks} passages={passages} />;
}

// ---- View shell + mode toggle --------------------------------------------

function PdfView({
  bookId,
  marks,
  passages,
}: Readonly<{ bookId: string; marks: PdfMark[]; passages: PdfPassage[] }>) {
  const t = useTranslations("pdf");
  const [mode, setMode] = useState<"areas" | "passages">("areas");

  // Restore the per-book preference.
  useEffect(() => {
    const saved = globalThis.localStorage?.getItem(`pdf-view-mode:${bookId}`);
    // One-time restore of the persisted view preference from an external store
    // (localStorage). Kept in an effect — not a lazy initializer — to avoid an
    // SSR hydration mismatch; this is a sanctioned external-system sync.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "areas" || saved === "passages") setMode(saved);
  }, [bookId]);

  function choose(next: "areas" | "passages") {
    setMode(next);
    globalThis.localStorage?.setItem(`pdf-view-mode:${bookId}`, next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <PdfUploader bookId={bookId} replace />
        <div className="flex gap-2" role="tablist">
          <button
            type="button"
            className={mode === "areas" ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => choose("areas")}
          >
            {t("viewAreas")}
          </button>
          <button
            type="button"
            className={mode === "passages" ? "btn btn-primary" : "btn btn-ghost"}
            onClick={() => choose("passages")}
          >
            {t("viewPassages")}
          </button>
        </div>
      </div>

      {mode === "areas" ? (
        <AreasMode bookId={bookId} marks={marks} passages={passages} />
      ) : (
        <PassagesColumn bookId={bookId} passages={passages} />
      )}
    </div>
  );
}

// ---- AreasMode: two-column PDF + passages with mark overlay ---------------

function AreasMode({
  bookId,
  marks: initialMarks,
  passages,
}: Readonly<{ bookId: string; marks: PdfMark[]; passages: PdfPassage[] }>) {
  const t = useTranslations("pdf");
  const router = useRouter();
  const [marks, setMarks] = useState<PdfMark[]>(initialMarks);
  const [, startTransition] = useTransition();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  const geomRef = useRef<PdfGeometry | null>(null);

  // Keep optimistic local marks in sync when the server data changes.
  // Intentional set-state-in-effect: syncing from a server-provided prop
  // (initialMarks) that updates after router.refresh() — not derivable via
  // memo, and the effect correctly runs only when the server value changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMarks(initialMarks), [initialMarks]);

  const areaCount = marks.length + 1;
  const aligned = passages.slice(0, areaCount);
  const surplus = passages.slice(areaCount);

  function addMark(point: PdfPoint) {
    const optimistic: PdfMark = { id: `tmp-${tmpMarkSeq++}`, ...point };
    setMarks((m) => [...m, optimistic]);
    startTransition(async () => {
      const res = await addMarkAction(bookId, point.page, point.frac);
      if (res.ok) router.refresh();
      else setMarks(initialMarks);
    });
  }

  function removeMark(id: string) {
    setMarks((m) => m.filter((x) => x.id !== id));
    startTransition(async () => {
      const res = await removeMarkAction(id, bookId);
      if (res.ok) router.refresh();
      else setMarks(initialMarks);
    });
  }

  // Visual-only during drag (no server write).
  function dragMark(id: string, point: PdfPoint) {
    setMarks((m) =>
      m.map((x) => (x.id === id ? { ...x, page: point.page, frac: point.frac } : x)),
    );
  }
  // Persist once on drop; revert to server marks on failure.
  function commitMark(id: string, point: PdfPoint) {
    setMarks((m) =>
      m.map((x) => (x.id === id ? { ...x, page: point.page, frac: point.frac } : x)),
    );
    startTransition(async () => {
      const res = await moveMarkAction(id, bookId, point.page, point.frac);
      if (res.ok) router.refresh();
      else setMarks(initialMarks);
    });
  }

  // Scroll choreography: map PDF scroll -> right column translate.
  function onScroll() {
    const scroller = scrollerRef.current;
    const column = columnRef.current;
    const g = geomRef.current;
    if (!scroller || !column || !g) return;
    const bounds = areaBounds(
      g.pageTops,
      g.pageHeights,
      marks as MarkPoint[],
      g.contentHeight,
    );
    const phi = focus(scroller.scrollTop, scroller.clientHeight, bounds);
    const target = columnTranslate(phi, BOX_H, BOX_GAP, scroller.clientHeight);
    column.style.transform = `translateY(${-target + scroller.scrollTop}px)`;
  }

  // Re-run the scroll choreography when the marks (and thus area bounds) change.
  useEffect(() => {
    const id = requestAnimationFrame(onScroll);
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks]);

  return (
    <>
      <p className="muted" style={{ fontSize: 12 }}>
        {t("marksHint")}
      </p>
      <div
        ref={scrollerRef}
        onScroll={() => requestAnimationFrame(onScroll)}
        style={{
          position: "relative",
          height: "78vh",
          overflow: "auto",
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ position: "relative" }}>
          <PdfPages
            url={`/books/${bookId}/pdf`}
            onPointClick={addMark}
            onGeometry={(g) => {
              geomRef.current = g;
              onScroll();
            }}
            overlay={(g) => (
              <MarkLayer
                geometry={g}
                marks={marks}
                onRemove={removeMark}
                onDrag={dragMark}
                onCommit={commitMark}
                removeLabel={t("removeMark")}
              />
            )}
          />
        </div>

        <div ref={columnRef} style={{ position: "relative", willChange: "transform" }}>
          <div className="flex flex-col" style={{ gap: BOX_GAP }}>
            {aligned.map((p) => (
              <PassageBox key={p.id} bookId={bookId} passage={p} fixedHeight />
            ))}
          </div>
          {surplus.length > 0 && (
            <div className="flex flex-col" style={{ gap: BOX_GAP, marginTop: BOX_GAP }}>
              <p className="section-label">{t("surplusPassages")}</p>
              {surplus.map((p) => (
                <PassageBox key={p.id} bookId={bookId} passage={p} fixedHeight />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---- Mark boundary lines drawn over the pages host, with drag + remove ----

function MarkLayer({
  geometry,
  marks,
  onRemove,
  onDrag,
  onCommit,
  removeLabel,
}: Readonly<{
  geometry: PdfGeometry;
  marks: PdfMark[];
  onRemove: (id: string) => void;
  onDrag: (id: string, point: PdfPoint) => void;
  onCommit: (id: string, point: PdfPoint) => void;
  removeLabel: string;
}>) {
  function pointFromClientY(clientY: number, hostTop: number): PdfPoint {
    // Resolve which page the y falls in, in content space.
    const y = clientY - hostTop;
    let page = 1;
    for (let i = 0; i < geometry.pageTops.length; i++) {
      if (y >= geometry.pageTops[i]) page = i + 1;
    }
    const top = geometry.pageTops[page - 1];
    const h = geometry.pageHeights[page - 1];
    const frac = Math.min(1, Math.max(0, (y - top) / h));
    return { page, frac };
  }

  return (
    <>
      {marks.map((m) => {
        const top = geometry.pageTops[m.page - 1] + m.frac * geometry.pageHeights[m.page - 1];
        const left = geometry.pageLefts[m.page - 1];
        const width = geometry.pageWidths[m.page - 1];
        return (
          <div
            key={m.id}
            style={{ position: "absolute", left, top, width }}
            onPointerDown={(e) => {
              e.preventDefault();
              const hostTop = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().top;
              let last = pointFromClientY(e.clientY, hostTop);
              const move = (ev: PointerEvent) => {
                last = pointFromClientY(ev.clientY, hostTop);
                onDrag(m.id, last);
              };
              const up = () => {
                onCommit(m.id, last);
                document.removeEventListener("pointermove", move);
                document.removeEventListener("pointerup", up);
              };
              document.addEventListener("pointermove", move);
              document.addEventListener("pointerup", up);
            }}
          >
            <div style={{ borderTop: "2px solid var(--accent)", cursor: "row-resize" }} />
            <button
              type="button"
              aria-label={removeLabel}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(m.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                right: 0,
                top: -10,
                fontSize: 12,
                lineHeight: 1,
                background: "var(--accent)",
                color: "#fff",
                border: 0,
                borderRadius: 3,
                padding: "1px 5px",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </>
  );
}

// ---- Passages-only column -------------------------------------------------

function PassagesColumn({
  bookId,
  passages,
}: Readonly<{ bookId: string; passages: PdfPassage[] }>) {
  return (
    <div className="flex flex-col" style={{ gap: BOX_GAP }}>
      {passages.map((p) => (
        <PassageBox key={p.id} bookId={bookId} passage={p} />
      ))}
    </div>
  );
}

// ---- One passage box: inline annotator + pencil raw-text edit -------------

function PassageBox({
  bookId,
  passage,
  fixedHeight = false,
}: Readonly<{ bookId: string; passage: PdfPassage; fixedHeight?: boolean }>) {
  const t = useTranslations("pdf");
  const tc = useTranslations("common");
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(passage.text);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updatePassageAction(passage.id, bookId, { text });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      className="card"
      style={{
        height: fixedHeight ? BOX_H : undefined,
        minHeight: BOX_H,
        overflow: "auto",
        position: "relative",
      }}
    >
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-serif)", fontSize: 16 }}>
          {t("areaLabel", { number: passage.number })}
          {passage.title ? ` · ${passage.title}` : ""}
        </span>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setEditing((v) => !v)}
          aria-label={editing ? t("doneEditing") : t("editText")}
          disabled={pending}
        >
          {editing ? t("doneEditing") : "✎"}
        </button>
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="field"
            rows={10}
            style={{ resize: "vertical", lineHeight: 1.6 }}
          />
          <div className="flex items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
              {pending ? tc("loading") : tc("save")}
            </button>
            {error && (
              <span className="error" role="alert">
                {error}
              </span>
            )}
          </div>
        </div>
      ) : (
        <PassageAnnotator
          passage={{ id: passage.id, title: passage.title, text: passage.text }}
          bookId={bookId}
          tags={passage.tags}
          placements={passage.placements}
        />
      )}
    </div>
  );
}

// ---- Uploader -------------------------------------------------------------

function PdfUploader({
  bookId,
  replace = false,
}: Readonly<{ bookId: string; replace?: boolean }>) {
  const t = useTranslations("pdf");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "reading" | "uploading" | "saving">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  async function onPick(file: File) {
    setError(null);
    try {
      // Count pages client-side with pdf.js (same worker setup as the renderer).
      setStatus("reading");
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pageCount = doc.numPages;

      // Presign, PUT to R2, then persist the key + page count.
      setStatus("uploading");
      const presign = await presignBookPdfUploadAction(bookId, file.name);
      if (!presign.ok) {
        setError(presign.error);
        setStatus("idle");
        return;
      }
      const put = await fetch(presign.url, {
        method: "PUT",
        headers: { "Content-Type": "application/pdf" },
        body: file,
      });
      if (!put.ok) {
        setError(t("uploadFailed", { status: put.status }));
        setStatus("idle");
        return;
      }

      setStatus("saving");
      const attach = await attachBookPdfAction(bookId, presign.key, pageCount);
      if (!attach.ok) {
        setError(attach.error);
        setStatus("idle");
        return;
      }
      setStatus("idle");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch {
      setError(t("readFailed"));
      setStatus("idle");
    }
  }

  const busy = status !== "idle";
  let label: string;
  if (status === "reading" || status === "uploading" || status === "saving") {
    label = t(status);
  } else {
    label = replace ? t("replacePdf") : t("uploadPdf");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        id={`pdf-input-${bookId}`}
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
        }}
      />
      <label
        htmlFor={`pdf-input-${bookId}`}
        className="btn btn-primary"
        aria-disabled={busy}
        style={busy ? { opacity: 0.6, pointerEvents: "none" } : undefined}
      >
        {label}
      </label>
      {error && (
        <span className="error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
