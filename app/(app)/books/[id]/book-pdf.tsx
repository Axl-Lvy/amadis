"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { PdfDocument, type PdfOverlay, type PdfPoint } from "@/app/_components/pdf-document";

import {
  attachBookPdfAction,
  clearPassageRegionAction,
  createPassageForRegionAction,
  presignBookPdfUploadAction,
  setPassageRegionAction,
  updatePassageAction,
} from "./actions";

// A passage as the segmenter needs it: number + optional continuous PDF region.
export type SegPassage = {
  id: string;
  number: number;
  title: string;
  text: string;
  startPage: number | null;
  startFrac: number | null;
  endPage: number | null;
  endFrac: number | null;
};

type Props = {
  bookId: string;
  hasPdf: boolean;
  passages: SegPassage[];
};

// The six layer hues cycle as passage marker colors so adjacent regions read apart.
const HUES = [
  "var(--hue-1)",
  "var(--hue-2)",
  "var(--hue-3)",
  "var(--hue-4)",
  "var(--hue-5)",
  "var(--hue-6)",
];

function hueFor(index: number): string {
  return HUES[index % HUES.length];
}

// BookPdf: (1) an uploader that reads the page count in the browser with pdf.js,
// PUTs the file to a presigned URL and records key+pageCount; and (2) once a PDF
// exists, a segmenter that renders the document, lets the user mark a START then
// an END point by clicking, shows existing passage regions as colored overlays,
// assigns the marked region to a new or existing passage, and offers a per-passage
// transcription textarea. No OCR.
export function BookPdf({ bookId, hasPdf, passages }: Readonly<Props>) {
  const t = useTranslations("pdf");

  if (!hasPdf) {
    return (
      <div className="flex flex-col gap-3">
        <p className="muted" style={{ fontSize: 13 }}>
          {t("noPdf")}
        </p>
        <PdfUploader bookId={bookId} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PdfUploader bookId={bookId} replace />
      <Segmenter bookId={bookId} passages={passages} />
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

// ---- Segmenter ------------------------------------------------------------

function Segmenter({
  bookId,
  passages,
}: Readonly<{ bookId: string; passages: SegPassage[] }>) {
  const t = useTranslations("pdf");
  const tc = useTranslations("common");
  const router = useRouter();

  const url = `/books/${bookId}/pdf`;

  // The marked region under construction: a start point, then an end point.
  const [start, setStart] = useState<PdfPoint | null>(null);
  const [end, setEnd] = useState<PdfPoint | null>(null);
  // Target for assigning the marked region: "" = new passage, else passage id.
  const [target, setTarget] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Overlays: a marker at each existing passage's start (numbered, colored) plus
  // the in-progress start/end markers.
  const overlays = useMemo<PdfOverlay[]>(() => {
    const items: PdfOverlay[] = [];
    passages.forEach((p, i) => {
      if (p.startPage != null && p.startFrac != null) {
        items.push({
          page: p.startPage,
          frac: p.startFrac,
          color: hueFor(i),
          label: t("regionStartLabel", { number: p.number }),
        });
      }
      if (p.endPage != null && p.endFrac != null) {
        items.push({ page: p.endPage, frac: p.endFrac, color: hueFor(i) });
      }
    });
    if (start) {
      items.push({ ...start, color: "var(--accent)", label: t("markStart") });
    }
    if (end) {
      items.push({ ...end, color: "var(--accent)", label: t("markEnd") });
    }
    return items;
  }, [passages, start, end, t]);

  function onPointClick(point: PdfPoint) {
    setError(null);
    // First click sets start; second sets end; a third restarts from this point.
    if (!start || (start && end)) {
      setStart(point);
      setEnd(null);
    } else {
      // Order the two clicks so start precedes end on the page sequence.
      const before =
        point.page < start.page ||
        (point.page === start.page && point.frac < start.frac);
      if (before) {
        setEnd(start);
        setStart(point);
      } else {
        setEnd(point);
      }
    }
  }

  function resetMark() {
    setStart(null);
    setEnd(null);
    setError(null);
  }

  function assign() {
    if (!start || !end) return;
    const region = {
      startPage: start.page,
      startFrac: start.frac,
      endPage: end.page,
      endFrac: end.frac,
    };
    setError(null);
    startTransition(async () => {
      const res =
        target === ""
          ? await createPassageForRegionAction({ bookId, region })
          : await setPassageRegionAction(target, bookId, region);
      if (res.ok) {
        resetMark();
        setTarget("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function clearRegion(passageId: string) {
    setError(null);
    startTransition(async () => {
      const res = await clearPassageRegionAction(passageId, bookId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const canAssign = Boolean(start && end) && !pending;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3">
        <p className="section-label">{t("segmentTitle")}</p>
        <p className="muted" style={{ fontSize: 12 }}>
          {t("segmentHint")}
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div style={{ fontSize: 13 }}>
            <span className="muted">{t("markStart")}: </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {start ? t("pointLabel", { page: start.page, pct: Math.round(start.frac * 100) }) : "—"}
            </span>
          </div>
          <div style={{ fontSize: 13 }}>
            <span className="muted">{t("markEnd")}: </span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>
              {end ? t("pointLabel", { page: end.page, pct: Math.round(end.frac * 100) }) : "—"}
            </span>
          </div>

          <label className="label" style={{ flex: "1 1 200px" }}>
            <span>{t("assignTo")}</span>
            <select
              className="field"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">{t("newPassage")}</option>
              {passages.map((p) => (
                <option key={p.id} value={p.id}>
                  {t("passageOption", { number: p.number, title: p.title })}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn-primary"
            onClick={assign}
            disabled={!canAssign}
          >
            {pending ? tc("loading") : t("assignRegion")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={resetMark}
            disabled={!start && !end}
          >
            {t("clearMark")}
          </button>
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>

      <PdfDocument url={url} onPointClick={onPointClick} overlays={overlays} />

      <RegionList
        bookId={bookId}
        passages={passages}
        onClear={clearRegion}
        pending={pending}
      />
    </div>
  );
}

// ---- Per-passage region row + transcription ------------------------------

function RegionList({
  bookId,
  passages,
  onClear,
  pending,
}: Readonly<{
  bookId: string;
  passages: SegPassage[];
  onClear: (passageId: string) => void;
  pending: boolean;
}>) {
  const t = useTranslations("pdf");

  const withRegion = passages.filter((p) => p.startPage != null);
  if (withRegion.length === 0) {
    return <p className="muted" style={{ fontSize: 13 }}>{t("noRegions")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="section-label">{t("regionsTitle")}</p>
      {withRegion.map((p) => (
        <PassageRegionRow
          key={p.id}
          bookId={bookId}
          passage={p}
          color={hueFor(passages.indexOf(p))}
          onClear={() => onClear(p.id)}
          clearing={pending}
        />
      ))}
    </div>
  );
}

function PassageRegionRow({
  bookId,
  passage,
  color,
  onClear,
  clearing,
}: Readonly<{
  bookId: string;
  passage: SegPassage;
  color: string;
  onClear: () => void;
  clearing: boolean;
}>) {
  const t = useTranslations("pdf");
  const tc = useTranslations("common");
  const router = useRouter();

  const [text, setText] = useState(passage.text);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function saveText() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updatePassageAction(passage.id, bookId, { text });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const region = t("regionRange", {
    startPage: passage.startPage ?? 0,
    startPct: Math.round((passage.startFrac ?? 0) * 100),
    endPage: passage.endPage ?? 0,
    endPct: Math.round((passage.endFrac ?? 0) * 100),
  });

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: color,
              flex: "none",
            }}
          />
          <span style={{ fontFamily: "var(--font-serif)", fontSize: 16 }}>
            {t("regionStartLabel", { number: passage.number })}
            {passage.title ? ` · ${passage.title}` : ""}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onClear}
          disabled={clearing || pending}
        >
          {t("clearRegion")}
        </button>
      </div>
      <p className="sub muted" style={{ fontSize: 12 }}>
        {region}
      </p>

      <label className="label">
        <span>{t("transcription")}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="field"
          rows={5}
          style={{ resize: "vertical", lineHeight: 1.6 }}
          placeholder={t("transcriptionPlaceholder")}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={saveText}
          disabled={pending}
        >
          {pending ? tc("loading") : t("saveTranscription")}
        </button>
        {saved && !pending && (
          <span className="muted" style={{ fontSize: 12 }}>
            {tc("save")}
          </span>
        )}
        {error && (
          <span className="error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
