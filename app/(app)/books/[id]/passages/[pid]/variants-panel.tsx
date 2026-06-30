"use client";

import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";

import { PdfDocument } from "@/app/_components/pdf-document";

import {
  attachVariantScan,
  createVariant,
  deleteVariant,
  presignVariantScanUpload,
  updateVariant,
} from "./variant-actions";
import styles from "./variants-panel.module.css";

// One alternative version of a passage. Defined here as the panel's prop shape;
// the Server Component passes plain data loaded via listVariants(user.id, …).
export type VariantView = {
  id: string;
  label: string | null;
  text: string;
  scanKey: string | null;
};

type Props = {
  passageId: string;
  variants: VariantView[];
};

// A scan key is treated as a PDF when its extension is .pdf, otherwise an image.
function isPdfKey(key: string | null): boolean {
  return !!key && /\.pdf(\?|#|$)/i.test(key);
}

export function VariantsPanel({ passageId, variants }: Readonly<Props>) {
  const t = useTranslations("variants");
  const params = useParams<{ id: string }>();
  const bookId = params?.id ?? "";

  return (
    <section className={styles.panel}>
      <p className="section-label">{t("title")}</p>

      {variants.length === 0 ? (
        <p className={styles.empty}>{t("empty")}</p>
      ) : (
        variants.map((variant) => (
          <VariantCard
            key={variant.id}
            variant={variant}
            bookId={bookId}
            passageId={passageId}
          />
        ))
      )}

      <NewVariantForm bookId={bookId} passageId={passageId} />
    </section>
  );
}

// ---- create -----------------------------------------------------------------

function NewVariantForm({
  bookId,
  passageId,
}: Readonly<{ bookId: string; passageId: string }>) {
  const t = useTranslations("variants");
  const common = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setLabel("");
    setText("");
    setError(null);
    setOpen(false);
  }

  function submit() {
    setError(null);
    const form = new FormData();
    form.set("bookId", bookId);
    form.set("passageId", passageId);
    form.set("label", label);
    form.set("text", text);
    startTransition(async () => {
      const res = await createVariant(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
          {t("addVariant")}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <fieldset
        className={styles.form}
        aria-label={t("addVariant")}
        style={{ border: 0, margin: 0, padding: 0, minInlineSize: 0 }}
      >
        <div className={styles.formRow}>
          <label className={styles.fieldLabel} htmlFor="new-variant-label">
            {t("labelField")}
          </label>
          <input
            id="new-variant-label"
            className="field"
            type="text"
            value={label}
            placeholder={t("labelPlaceholder")}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.fieldLabel} htmlFor="new-variant-text">
            {t("textField")}
          </label>
          <textarea
            id="new-variant-text"
            className={`field ${styles.textarea}`}
            value={text}
            placeholder={t("textPlaceholder")}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.formActions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={isPending}
          >
            {isPending ? common("loading") : common("create")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={reset}
            disabled={isPending}
          >
            {common("cancel")}
          </button>
        </div>
      </fieldset>
    </div>
  );
}

// ---- one variant ------------------------------------------------------------

function VariantCard({
  variant,
  bookId,
  passageId,
}: Readonly<{ variant: VariantView; bookId: string; passageId: string }>) {
  const t = useTranslations("variants");
  const common = useTranslations("common");
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(variant.label ?? "");
  const [text, setText] = useState(variant.text);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function startEdit() {
    setLabel(variant.label ?? "");
    setText(variant.text);
    setError(null);
    setEditing(true);
  }

  function saveEdit() {
    setError(null);
    const form = new FormData();
    form.set("bookId", bookId);
    form.set("passageId", passageId);
    form.set("id", variant.id);
    form.set("label", label);
    form.set("text", text);
    startTransition(async () => {
      const res = await updateVariant(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    const form = new FormData();
    form.set("bookId", bookId);
    form.set("passageId", passageId);
    form.set("id", variant.id);
    startTransition(async () => {
      const res = await deleteVariant(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <article className={`card ${styles.variant}`}>
      {editing ? (
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel} htmlFor={`label-${variant.id}`}>
              {t("labelField")}
            </label>
            <input
              id={`label-${variant.id}`}
              className="field"
              type="text"
              value={label}
              placeholder={t("labelPlaceholder")}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.fieldLabel} htmlFor={`text-${variant.id}`}>
              {t("textField")}
            </label>
            <textarea
              id={`text-${variant.id}`}
              className={`field ${styles.textarea}`}
              value={text}
              placeholder={t("textPlaceholder")}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.formActions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveEdit}
              disabled={isPending}
            >
              {isPending ? common("loading") : common("save")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setEditing(false)}
              disabled={isPending}
            >
              {common("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.head}>
            <h3 className={styles.label}>
              {variant.label ? (
                variant.label
              ) : (
                <span className={styles.labelEmpty}>{t("untitled")}</span>
              )}
            </h3>
            <div className={styles.actions}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={startEdit}
                disabled={isPending}
              >
                {common("edit")}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={remove}
                disabled={isPending}
              >
                {common("delete")}
              </button>
            </div>
          </div>
          {variant.text.trim() ? (
            <p className={styles.text}>{variant.text}</p>
          ) : (
            <p className={`${styles.text} ${styles.textEmpty}`}>{t("noText")}</p>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </>
      )}

      <VariantScan variant={variant} bookId={bookId} passageId={passageId} />
    </article>
  );
}

// ---- scan (per variant): upload + view --------------------------------------

function VariantScan({
  variant,
  bookId,
  passageId,
}: Readonly<{ variant: VariantView; bookId: string; passageId: string }>) {
  const t = useTranslations("variants");
  const common = useTranslations("common");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Lazily-resolved presigned view URL plus its media kind.
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    const contentType = file.type || "application/octet-stream";
    startTransition(async () => {
      const presigned = await presignVariantScanUpload(variant.id, file.name, contentType);
      if (!presigned.ok) {
        setError(presigned.error);
        return;
      }
      try {
        const res = await fetch(presigned.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": contentType },
        });
        if (!res.ok) {
          setError(t("uploadFailedStatus", { status: res.status }));
          return;
        }
      } catch {
        setError(t("uploadFailed"));
        return;
      }
      const attached = await attachVariantScan(bookId, passageId, variant.id, presigned.key);
      if (!attached.ok) {
        setError(attached.error);
        return;
      }
      if (inputRef.current) inputRef.current.value = "";
      // Drop any cached view so the next "view" fetches the freshly-uploaded scan.
      setViewUrl(null);
      setViewing(false);
      router.refresh();
    });
  }

  function toggleView() {
    if (viewing) {
      setViewing(false);
      return;
    }
    setError(null);
    // Same-origin owner-scoped proxy stream (no-store), so both image and PDF
    // scans render without R2 CORS — the route resolves the current scanKey, so
    // the URL stays stable across re-uploads.
    setViewUrl(`/variants/${variant.id}/scan`);
    setViewing(true);
  }

  const pdf = isPdfKey(variant.scanKey);

  return (
    <div className={styles.scan}>
      <p className="section-label">{t("scan")}</p>
      <div className={styles.scanRow}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          className={styles.fileInput}
          aria-label={t("chooseScan")}
        />
        <button
          type="button"
          className="btn btn-ghost"
          onClick={upload}
          disabled={isPending}
        >
          {isPending ? common("loading") : t("uploadScan")}
        </button>
        {variant.scanKey && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={toggleView}
            disabled={isPending}
            aria-expanded={viewing}
          >
            {viewing ? t("hideScan") : t("viewScan")}
          </button>
        )}
      </div>

      {!variant.scanKey && <p className={styles.empty}>{t("noScan")}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {viewing && viewUrl && (
        <div className={styles.scanFrame}>
          {pdf ? (
            <PdfDocument url={viewUrl} />
          ) : (
            // Owner-scoped same-origin proxy stream; a plain img avoids next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.scanImage}
              src={viewUrl}
              alt={t("scanAlt", { label: variant.label ?? t("untitled") })}
            />
          )}
        </div>
      )}
    </div>
  );
}
