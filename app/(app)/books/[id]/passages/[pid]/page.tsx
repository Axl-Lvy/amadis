import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { getBook } from "@/lib/services/books";
import { isServiceError } from "@/lib/services/errors";
import { getPassage } from "@/lib/services/passages";
import { listPlacements } from "@/lib/services/placements";
import { listAllTags } from "@/lib/services/tags";
import { listVariants } from "@/lib/services/variants";

import { PassageAnnotator, type PlacementView } from "./passage-annotator";
import { PassageEditor } from "./passage-editor";
import { VariantsPanel } from "./variants-panel";

// Session + per-user reads depend on cookies, so this page is always dynamic.
export const dynamic = "force-dynamic";

export default async function PassageDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string; pid: string }> }>) {
  const { id, pid } = await params;
  const user = await requireUser();

  let book;
  let passage;
  try {
    book = await getBook(user.id, id);
    passage = await getPassage(user.id, pid);
  } catch (e) {
    if (isServiceError(e)) notFound();
    throw e;
  }
  // The passage must belong to the book in the URL (both already owner-scoped).
  if (passage.bookId !== id) notFound();

  // All reads are owner-scoped; no cross-user data is ever returned.
  const [tags, placementRows, variants] = await Promise.all([
    listAllTags(user.id),
    listPlacements(user.id, pid),
    listVariants(user.id, pid),
  ]);

  const placements: PlacementView[] = placementRows.map((p) => ({
    id: p.id,
    field: p.field === "TITLE" ? "TITLE" : "TEXT",
    start: p.start,
    end: p.end,
    description: p.description,
    tagIds: p.tags.map((t) => t.tagId),
  }));

  const variantViews = variants.map((v) => ({
    id: v.id,
    label: v.label,
    text: v.text,
    scanKey: v.scanKey,
  }));

  return (
    <>
      <div className="content-header">
        <div>
          <h1>{passage.title || `#${passage.number}`}</h1>
          <p className="sub">
            {book.title} · #{passage.number}
          </p>
        </div>
        <Link
          href={`/books/${book.id}`}
          className="btn btn-ghost"
          style={{ textDecoration: "none" }}
        >
          ← {book.title}
        </Link>
      </div>

      <div className="flex flex-col gap-7">
        <PassageEditor
          bookId={book.id}
          passage={{
            id: passage.id,
            number: passage.number,
            title: passage.title,
            text: passage.text,
          }}
        />

        <PassageAnnotator
          passage={{ id: passage.id, title: passage.title, text: passage.text }}
          bookId={book.id}
          tags={tags}
          placements={placements}
        />

        <VariantsPanel passageId={passage.id} variants={variantViews} />
      </div>
    </>
  );
}
