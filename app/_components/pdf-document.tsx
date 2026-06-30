"use client";

import type { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PdfPoint = { page: number; frac: number };

export type PdfGeometry = {
  pageTops: number[];
  pageHeights: number[];
  pageLefts: number[];
  pageWidths: number[];
  contentHeight: number;
};

type Props = {
  url: string;
  onPointClick?: (point: PdfPoint) => void;
  onGeometry?: (g: PdfGeometry) => void;
  overlay?: (g: PdfGeometry) => ReactNode;
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

export function PdfPages({ url, onPointClick, onGeometry, overlay }: Readonly<Props>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<PdfGeometry | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Always call the latest onGeometry (resize fires from a mount-only effect).
  const onGeometryRef = useRef(onGeometry);
  useEffect(() => {
    onGeometryRef.current = onGeometry;
  }, [onGeometry]);

  function measure() {
    const pages = pagesRef.current;
    if (!pages) return;
    const wrappers = Array.from(pages.querySelectorAll<HTMLElement>("[data-page]"));
    if (wrappers.length === 0) return;
    const g: PdfGeometry = {
      pageTops: wrappers.map((w) => w.offsetTop),
      pageHeights: wrappers.map((w) => w.offsetHeight),
      pageLefts: wrappers.map((w) => w.offsetLeft),
      pageWidths: wrappers.map((w) => w.offsetWidth),
      contentHeight: pages.scrollHeight,
    };
    setGeometry(g);
    onGeometryRef.current?.(g);
  }

  useEffect(() => {
    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;

    (async () => {
      setStatus("loading");
      setGeometry(null);
      try {
        const pdfjs = await configureWorker();
        task = pdfjs.getDocument({ url, withCredentials: true });
        const doc = await task.promise;
        if (cancelled) return;

        const pages = pagesRef.current;
        if (!pages) return;
        pages.replaceChildren();
        const targetWidth = (pages.clientWidth || 800) - 4;

        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: targetWidth / base.width });

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
          pages.appendChild(wrapper);

          await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          if (cancelled) return;
        }
        if (cancelled) return;
        setStatus("ready");
        requestAnimationFrame(measure);
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      task?.destroy().catch(() => {});
    };
  }, [url]);

  // Re-measure on resize (uses the latest onGeometry via the ref).
  useEffect(() => {
    const pages = pagesRef.current;
    if (!pages) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(pages);
    return () => ro.disconnect();
  }, []);

  // Click-to-pick a point: frac from the clicked page's own rect.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !onPointClick) return;
    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement).closest<HTMLElement>("[data-page]");
      if (!el) return;
      const page = Number(el.dataset.page);
      const r = el.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (event.clientY - r.top) / r.height));
      onPointClick({ page, frac });
    };
    host.addEventListener("click", onClick);
    return () => host.removeEventListener("click", onClick);
  }, [onPointClick]);

  return (
    <div style={{ position: "relative" }}>
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
      {/* Positioned host: imperative canvases (pagesRef) + React-managed overlay
          are siblings, so overlay content positioned with host-relative pageTops
          shares this host's coordinate origin, and replaceChildren() on pagesRef
          never touches the React overlay. */}
      <div
        ref={hostRef}
        style={{ position: "relative", cursor: onPointClick ? "crosshair" : "default" }}
      >
        <div ref={pagesRef} />
        {geometry && overlay?.(geometry)}
      </div>
    </div>
  );
}

// Self-contained scrollable PDF viewer used where the PDF is just displayed
// (e.g. a variant scan). The areas view uses <PdfPages> directly with its own
// shared scroll container instead.
export function PdfDocument({ url }: Readonly<{ url: string }>) {
  return (
    <div
      style={{
        height: "70vh",
        overflow: "auto",
        background: "var(--surface-2)",
        border: "1px solid var(--line)",
        borderRadius: 12,
        padding: 12,
      }}
    >
      <PdfPages url={url} />
    </div>
  );
}
