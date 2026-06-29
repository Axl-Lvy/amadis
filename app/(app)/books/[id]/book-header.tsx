"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { getString } from "@/lib/forms";

import { updateBookAction } from "./actions";

type Props = {
  id: string;
  title: string;
  author: string | null;
};

// Inline edit of a book's title and author. Renders as the page heading until
// the user clicks Edit, then swaps to a compact form. Saves via the
// result-returning updateBookAction so a validation error (e.g. empty title)
// surfaces inline instead of being masked by the production build.
export function BookHeader({ id, title, author }: Readonly<Props>) {
  const t = useTranslations("books");
  const tc = useTranslations("common");
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(formData: FormData) {
    const nextTitle = getString(formData, "title");
    const nextAuthor = getString(formData, "author");
    setError(null);
    startTransition(async () => {
      const res = await updateBookAction(id, {
        title: nextTitle,
        author: nextAuthor || null,
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (!editing) {
    return (
      <div className="content-header">
        <div>
          <h1>{title}</h1>
          <p className="sub">{author || t("noAuthor")}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setError(null);
            setEditing(true);
          }}
        >
          {tc("edit")}
        </button>
      </div>
    );
  }

  return (
    <div className="content-header">
      <form
        action={save}
        className="flex w-full flex-col gap-3 sm:flex-row sm:items-end"
      >
        <label className="label" style={{ flex: 2 }}>
          <span>{t("fields.title")}</span>
          <input
            name="title"
            type="text"
            required
            defaultValue={title}
            className="field"
            autoFocus
          />
        </label>
        <label className="label" style={{ flex: 2 }}>
          <span>{t("fields.author")}</span>
          <input
            name="author"
            type="text"
            defaultValue={author ?? ""}
            className="field"
          />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? tc("loading") : tc("save")}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
          >
            {tc("cancel")}
          </button>
        </div>
        {error && (
          <p className="error" role="alert" style={{ flexBasis: "100%" }}>
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
