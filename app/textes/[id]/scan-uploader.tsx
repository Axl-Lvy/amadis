"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { attachScan, presignScanUpload } from "./actions";

// Upload a scan straight to R2 via a presigned PUT, then record its key.
// The file bytes go browser -> R2 directly and never pass through Vercel.
export function ScanUploader({ texteId }: { texteId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    startTransition(async () => {
      try {
        const { url, key } = await presignScanUpload(
          texteId,
          file.name,
          file.type || "application/octet-stream",
        );
        const res = await fetch(url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status})`);
        }
        await attachScan(texteId, key);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="text-sm"
      />
      <button
        type="button"
        onClick={upload}
        disabled={isPending}
        className="rounded-md bg-black px-3 py-1 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {isPending ? "Uploading…" : "Upload scan"}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
}
