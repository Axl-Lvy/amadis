"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { updatePassageAction } from "../../actions";

export type PassageEditorProps = {
  bookId: string;
  passage: {
    id: string;
    number: number;
    title: string;
    text: string;
  };
};

// Inline edit of a passage's number, title and text. Saves through the
// result-returning updatePassageAction (so a bad number surfaces inline rather
// than being masked in production). The service re-normalizes title/text to NFC
// on save; placements whose offsets fall outside a shrunken text are NOT touched
// here — rendering elsewhere (the annotator) clamps/flags stale spans.
export function PassageEditor({ bookId, passage }: Readonly<PassageEditorProps>) {
  const t = useTranslations("passages");
  const tc = useTranslations("common");
  const router = useRouter();

  const [number, setNumber] = useState(String(passage.number));
  const [title, setTitle] = useState(passage.title);
  const [text, setText] = useState(passage.text);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    const parsed = Number(number);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updatePassageAction(passage.id, bookId, {
        number: Number.isFinite(parsed) ? parsed : undefined,
        title,
        text,
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <section className="card flex flex-col gap-4">
      <p className="section-label">{t("editTitle")}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="label" style={{ flex: "0 0 100px" }}>
          <span>{t("fields.number")}</span>
          <input
            type="number"
            min={0}
            step={1}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="field"
          />
        </label>
        <label className="label" style={{ flex: 1 }}>
          <span>{t("fields.title")}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field"
            placeholder={t("fields.titlePlaceholder")}
          />
        </label>
      </div>

      <label className="label">
        <span>{t("fields.text")}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="field"
          rows={10}
          style={{ resize: "vertical", lineHeight: 1.6 }}
          placeholder={t("fields.textPlaceholder")}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={pending}
        >
          {pending ? tc("loading") : tc("save")}
        </button>
        {saved && !pending && (
          <span className="muted" style={{ fontSize: 12 }}>
            {t("saved")}
          </span>
        )}
        {error && (
          <span className="error" role="alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}

export default PassageEditor;
