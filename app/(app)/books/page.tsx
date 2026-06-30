import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireUser } from "@/lib/session";
import { listBooks } from "@/lib/services/books";

import { createBookAction, deleteBookAction } from "./actions";

// Reads the session and the caller's books, so it renders dynamically.
export const dynamic = "force-dynamic";

export default async function BooksPage() {
  const user = await requireUser();
  const t = await getTranslations("books");
  const tc = await getTranslations("common");

  const books = await listBooks(user.id);

  return (
    <>
      <div className="content-header">
        <div>
          <h1>{t("title")}</h1>
          <p className="sub">{t("count", { count: books.length })}</p>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 26 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>
          {t("newBook")}
        </p>
        <form
          action={createBookAction}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="label" style={{ flex: 2 }}>
            <span>{t("fields.title")}</span>
            <input
              name="title"
              type="text"
              required
              className="field"
              placeholder={t("fields.titlePlaceholder")}
            />
          </label>
          <label className="label" style={{ flex: 2 }}>
            <span>{t("fields.author")}</span>
            <input
              name="author"
              type="text"
              className="field"
              placeholder={t("fields.authorPlaceholder")}
            />
          </label>
          <button type="submit" className="btn btn-primary">
            {tc("create")}
          </button>
        </form>
      </section>

      {books.length === 0 ? (
        <p className="muted">{t("empty")}</p>
      ) : (
        <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {books.map((book) => (
            <li key={book.id} className="row">
              <div style={{ minWidth: 0 }}>
                <Link href={`/books/${book.id}`} className="title">
                  {book.title}
                </Link>
                <div className="sub">
                  {book.author ? `${book.author} · ` : ""}
                  {t("passageCount", { count: book._count.passages })}
                  {book.pdfKey
                    ? ` · ${t("pdfBadge", { pages: book.pageCount ?? 0 })}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {book.pdfKey && (
                  <span
                    className="section-label"
                    style={{
                      border: "1px solid var(--line-2)",
                      borderRadius: 6,
                      padding: "3px 7px",
                    }}
                  >
                    {t("hasPdf")}
                  </span>
                )}
                <form action={deleteBookAction}>
                  <input type="hidden" name="id" value={book.id} />
                  <button
                    type="submit"
                    className="btn btn-ghost"
                    aria-label={t("deleteAria", { title: book.title })}
                  >
                    {tc("delete")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
