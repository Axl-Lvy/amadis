"use client";

import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

// Reusable continuous-scroll PDF renderer (pdf.js). Loads client-side only —
// pdf.js touches browser-only globals, so it is dynamically imported inside an
// effect and never evaluated during SSR. The worker is the version-matched copy
// shipped in pdfjs-dist, resolved as a bundled asset URL so it works under the
// Next 16 / Turbopack build without any CDN or /public copy.
//
// A "point" on the document is (page, frac) where page is 1-based and frac is the
// vertical position in [0,1] within that page — exactly the coordinate space the
// passage segmenter stores as (startPage, startFrac) -> (endPage, endFrac).

export type PdfPoint = { page: number; frac: number };

export type PdfOverlay = {
  page: number;
  frac: number;
  color?: string;
  label?: string;
};

type PageRect = { page: number; top: number; height: number; width: number; left: number };

type Props = {
  url: string;
  onPointClick?: (point: PdfPoint) => void;
  overlays?: PdfOverlay[];
  onReady?: (numPages: number) => void;
};

let workerConfigured = false;

async function configureWorker(): Promise<typeof import("pdfjs-dist")> {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    workerConfigured = true;
  }
  return pdfjs;
}

export function PdfDocument({ url, onPointClick, overlays = [], onReady }: Readonly<Props>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<PageRect[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;

    (async () => {
      setStatus("loading");
      setRects([]);
      try {
        const pdfjs = await configureWorker();
        task = pdfjs.getDocument({ url, withCredentials: true });
        const doc = await task.promise;
        if (cancelled) return;
        onReady?.(doc.numPages);

        const host = pagesRef.current;
        if (!host) return;
        host.replaceChildren();
        const targetWidth = (scrollRef.current?.clientWidth ?? 800) - 24;
        const nextRects: PageRect[] = [];

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const scale = targetWidth / base.width;
          const viewport = page.getViewport({ scale });

          const wrapper = document.createElement("div");
          wrapper.dataset.page = String(n);
          wrapper.style.position = "relative";
          wrapper.style.margin = "0 auto 12px";
          wrapper.style.width = `${viewport.width}px`;
          wrapper.style.height = `${viewport.height}px`;

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "100%";
          canvas.style.display = "block";
          canvas.style.borderRadius = "6px";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          wrapper.appendChild(canvas);
          host.appendChild(wrapper);

          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;

          nextRects.push({
            page: n,
            top: wrapper.offsetTop,
            height: viewport.height,
            width: viewport.width,
            left: wrapper.offsetLeft,
          });
        }
        if (cancelled) return;
        setRects(nextRects);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      task?.destroy().catch(() => {});
    };
  }, [url, onReady]);

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onPointClick) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-page]");
      if (!target) return;
      const page = Number(target.dataset.page);
      const r = target.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
      onPointClick({ page, frac });
    },
    [onPointClick],
  );

  return (
    <div
      ref={scrollRef}
      style={{
        position: "relative",
        height: "70vh",
        overflow: "auto",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 12,
      }}
    >
      {status === "loading" && (
        <p className="text-sm muted" style={{ padding: 12 }}>
          …
        </p>
      )}
      {status === "error" && (
        <p className="text-sm" style={{ padding: 12, color: "var(--hue-4)" }}>
          ⚠
        </p>
      )}
      <div
        ref={pagesRef}
        onClick={handleClick}
        style={{ cursor: onPointClick ? "crosshair" : "default" }}
      />
      {/* Overlay markers, positioned over the rendered pages. */}
      {rects.length > 0 &&
        overlays.map((o, i) => {
          const rect = rects.find((r) => r.page === o.page);
          if (!rect) return null;
          const top = rect.top + o.frac * rect.height;
          return (
            <div
              key={`${o.page}-${o.frac}-${i}`}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: rect.left,
                top,
                width: rect.width,
                borderTop: `2px solid ${o.color ?? "var(--accent)"}`,
                pointerEvents: "none",
              }}
            >
              {o.label && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    top: -9,
                    fontSize: 10,
                    fontFamily: "var(--font-geist-mono), monospace",
                    background: o.color ?? "var(--accent)",
                    color: "#fff",
                    padding: "0 4px",
                    borderRadius: 3,
                  }}
                >
                  {o.label}
                </span>
              )}
            </div>
          );
        })}
    </div>
  );
}
