import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { getBook } from "@/lib/services/books";
import { isServiceError } from "@/lib/services/errors";
import { listPassages } from "@/lib/services/passages";

import {
  createPassageAction,
  deletePassageAction,
  reorderPassagesFormAction,
} from "./actions";
import { BookHeader } from "./book-header";
import { BookPdf, type SegPassage } from "./book-pdf";

// Reads the session and the book's data, so it renders dynamically.
export const dynamic = "force-dynamic";

export default async function BookDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  const user = await requireUser();
  const t = await getTranslations("books");
  const tp = await getTranslations("passages");
  const tc = await getTranslations("common");

  let book;
  try {
    book = await getBook(user.id, id);
  } catch (e) {
    if (isServiceError(e)) notFound();
    throw e;
  }

  const passages = await listPassages(user.id, id);

  const segPassages: SegPassage[] = passages.map((p) => ({
    id: p.id,
    number: p.number,
    title: p.title,
    text: p.text,
    startPage: p.startPage,
    startFrac: p.startFrac,
    endPage: p.endPage,
    endFrac: p.endFrac,
  }));

  return (
    <>
      <BookHeader id={book.id} title={book.title} author={book.author} />

      {/* Passages -------------------------------------------------------- */}
      <section style={{ marginBottom: 32 }}>
        <p className="section-label" style={{ marginBottom: 12 }}>
          {tp("title")}
        </p>

        <div className="card" style={{ marginBottom: 16 }}>
          <p className="section-label" style={{ marginBottom: 12 }}>
            {tp("newPassage")}
          </p>
          <form
            action={createPassageAction}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="bookId" value={book.id} />
            <label className="label" style={{ flex: "0 0 100px" }}>
              <span>{tp("fields.number")}</span>
              <input
                name="number"
                type="number"
                min={0}
                step={1}
                className="field"
                placeholder={tp("fields.numberAuto")}
              />
            </label>
            <label className="label" style={{ flex: 1 }}>
              <span>{tp("fields.title")}</span>
              <input
                name="title"
                type="text"
                className="field"
                placeholder={tp("fields.titlePlaceholder")}
              />
            </label>
            <button type="submit" className="btn btn-primary">
              {tc("add")}
            </button>
          </form>
        </div>

        {passages.length === 0 ? (
          <p className="muted">{tp("empty")}</p>
        ) : (
          <ul className="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {passages.map((p, i) => {
              // Move-up / move-down reorder: swap with the neighbour and send
              // the full id order to reorderPassagesAction (renumbers 1..n).
              const ids = passages.map((x) => x.id);
              const upOrder = [...ids];
              if (i > 0) [upOrder[i - 1], upOrder[i]] = [upOrder[i], upOrder[i - 1]];
              const downOrder = [...ids];
              if (i < passages.length - 1)
                [downOrder[i], downOrder[i + 1]] = [downOrder[i + 1], downOrder[i]];

              const moveUp = reorderPassagesFormAction.bind(null, book.id, upOrder);
              const moveDown = reorderPassagesFormAction.bind(null, book.id, downOrder);

              return (
                <li key={p.id} className="row">
                  <div style={{ minWidth: 0 }}>
                    <Link
                      href={`/books/${book.id}/passages/${p.id}`}
                      className="title"
                    >
                      {tp("rowTitle", {
                        number: p.number,
                        title: p.title || tp("untitled"),
                      })}
                    </Link>
                    <div className="sub">
                      {p.startPage == null
                        ? tp("noRegion")
                        : tp("hasRegion", {
                            startPage: p.startPage,
                            endPage: p.endPage ?? p.startPage,
                          })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={moveUp}>
                      <button
                        type="submit"
                        className="btn btn-ghost"
                        disabled={i === 0}
                        aria-label={tp("moveUp")}
                        title={tp("moveUp")}
                      >
                        ↑
                      </button>
                    </form>
                    <form action={moveDown}>
                      <button
                        type="submit"
                        className="btn btn-ghost"
                        disabled={i === passages.length - 1}
                        aria-label={tp("moveDown")}
                        title={tp("moveDown")}
                      >
                        ↓
                      </button>
                    </form>
                    <form action={deletePassageAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="bookId" value={book.id} />
                      <button
                        type="submit"
                        className="btn btn-ghost"
                        aria-label={tp("deleteAria", { number: p.number })}
                      >
                        {tc("delete")}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* PDF + manual segmentation -------------------------------------- */}
      <section>
        <p className="section-label" style={{ marginBottom: 12 }}>
          {t("pdfSection")}
        </p>
        <BookPdf
          bookId={book.id}
          hasPdf={Boolean(book.pdfKey)}
          passages={segPassages}
        />
      </section>
    </>
  );
}
