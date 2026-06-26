"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { attachScan, presignScanUpload } from "./actions";

// Upload a scan straight to R2 via a presigned PUT, then record its key.
// The file bytes go browser -> R2 directly and never pass through Vercel.
export function ScanUploader({ texteId }: { texteId: string }) {
  const router = useRouter();
  const t = useTranslations("scanUploader");
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
          throw new Error(t("errors.uploadFailedStatus", { status: res.status }));
        }
        await attachScan(texteId, key);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t("errors.uploadFailed"));
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
        className="btn btn-ghost disabled:opacity-50"
      >
        {isPending ? t("uploading") : t("uploadScan")}
      </button>
      {error && <span style={{ color: "var(--hue-4)" }}>{error}</span>}
    </div>
  );
}
