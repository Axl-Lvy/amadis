"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { PdfPages } from "@/app/_components/pdf-document";
import type { TagNode } from "@/lib/tag-tree";

import {
  attachBookPdfAction,
  presignBookPdfUploadAction,
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

// ---- Temporary AreasMode stub (Task 11 replaces this) --------------------

function AreasMode({
  bookId,
  marks: _marks,
  passages,
}: Readonly<{ bookId: string; marks: PdfMark[]; passages: PdfPassage[] }>) {
  // Task 11 replaces this with the two-column choreographed layout.
  return (
    <div className="flex flex-col gap-4">
      <PdfPages url={`/books/${bookId}/pdf`} />
      <PassagesColumn bookId={bookId} passages={passages} />
    </div>
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
