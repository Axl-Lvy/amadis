"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { getString } from "@/lib/forms";
import { requireUserId } from "@/lib/session";
import {
  attachBookPdf,
  presignBookPdfUpload,
  updateBook,
} from "@/lib/services/books";
import { isServiceError } from "@/lib/services/errors";
import {
  createPassage,
  deletePassage,
  listPassages,
  reorderPassages,
  updatePassage,
} from "@/lib/services/passages";
import { createMark, deleteMark, listMarks, updateMark } from "@/lib/services/marks";

// Book-detail mutations. Two flavours:
//  - Plain `<form action>` create/delete may throw (the page re-renders).
//  - Programmatic actions a client component invokes return the
//    { ok: true } | { ok: false; error } shape, because thrown server-action
//    messages are masked in a production build. On a ServiceError we translate
//    its stable .code under the `errors` namespace; anything else rethrows.

export type ActionResult = { ok: true } | { ok: false; error: string };

async function fail(e: unknown): Promise<{ ok: false; error: string }> {
  if (isServiceError(e)) {
    const t = await getTranslations("errors");
    return { ok: false, error: t(e.code) };
  }
  throw e;
}

// ---- Book header (inline edit) -------------------------------------------

export async function updateBookAction(
  id: string,
  input: { title?: string; author?: string | null },
): Promise<ActionResult> {
  try {
    const ownerId = await requireUserId();
    await updateBook(ownerId, id, input);
    revalidatePath(`/books/${id}`);
    revalidatePath("/books");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---- Passages -------------------------------------------------------------

// Form-action create from the detail page: number auto-assigned when omitted.
export async function createPassageAction(formData: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const bookId = getString(formData, "bookId");
  const numberRaw = getString(formData, "number").trim();
  const title = getString(formData, "title");
  const text = getString(formData, "text");
  await createPassage(ownerId, {
    bookId,
    number: numberRaw === "" ? undefined : Number(numberRaw),
    title,
    text,
  });
  revalidatePath(`/books/${bookId}`);
}

// Form-action delete from the detail page.
export async function deletePassageAction(formData: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const id = getString(formData, "id");
  const bookId = getString(formData, "bookId");
  await deletePassage(ownerId, id);
  revalidatePath(`/books/${bookId}`);
}

// Programmatic update (number / title / text), used by the inline passage
// editor and the segmenter transcription textarea.
export async function updatePassageAction(
  id: string,
  bookId: string,
  input: { number?: number; title?: string; text?: string },
): Promise<ActionResult> {
  try {
    const ownerId = await requireUserId();
    await updatePassage(ownerId, id, input);
    revalidatePath(`/books/${bookId}`);
    revalidatePath(`/books/${bookId}/passages/${id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Programmatic reorder (move up/down): the page sends the new id order.
export async function reorderPassagesAction(
  bookId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  try {
    const ownerId = await requireUserId();
    await reorderPassages(ownerId, bookId, orderedIds);
    revalidatePath(`/books/${bookId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// Form-action variant of reorder (the move up/down buttons): returns void so it
// is assignable to a <form action>, unlike the result-returning programmatic one.
export async function reorderPassagesFormAction(
  bookId: string,
  orderedIds: string[],
): Promise<void> {
  await reorderPassagesAction(bookId, orderedIds);
}

// ---- PDF marks ------------------------------------------------------------

export async function addMarkAction(
  bookId: string,
  page: number,
  frac: number,
): Promise<ActionResult & { id?: string }> {
  try {
    const ownerId = await requireUserId();
    const mark = await createMark(ownerId, { bookId, page, frac });
    // Keep the invariant passages >= areas (areas = marks + 1): adding a mark
    // splits one area into two, so top up empty passages when there are too few.
    const [allMarks, passages] = await Promise.all([
      listMarks(ownerId, bookId),
      listPassages(ownerId, bookId),
    ]);
    const need = allMarks.length + 1 - passages.length;
    for (let i = 0; i < need; i++) {
      await createPassage(ownerId, { bookId });
    }
    revalidatePath(`/books/${bookId}`);
    return { ok: true, id: mark.id };
  } catch (e) {
    return fail(e);
  }
}

export async function moveMarkAction(
  id: string,
  bookId: string,
  page: number,
  frac: number,
): Promise<ActionResult> {
  try {
    const ownerId = await requireUserId();
    await updateMark(ownerId, id, { page, frac });
    revalidatePath(`/books/${bookId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMarkAction(id: string, bookId: string): Promise<ActionResult> {
  try {
    const ownerId = await requireUserId();
    await deleteMark(ownerId, id);
    revalidatePath(`/books/${bookId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---- PDF upload -----------------------------------------------------------

// Presign a browser PUT for the book PDF. The key is owner+book namespaced by
// the service so a client can never aim it outside its own space.
export async function presignBookPdfUploadAction(
  bookId: string,
  filename: string,
): Promise<{ ok: true; url: string; key: string } | { ok: false; error: string }> {
  try {
    const ownerId = await requireUserId();
    const { url, key } = await presignBookPdfUpload(ownerId, bookId, filename);
    return { ok: true, url, key };
  } catch (e) {
    return fail(e);
  }
}

// Persist the uploaded key + page count after a successful PUT.
export async function attachBookPdfAction(
  bookId: string,
  key: string,
  pageCount: number,
): Promise<ActionResult> {
  try {
    const ownerId = await requireUserId();
    await attachBookPdf(ownerId, bookId, key, pageCount);
    revalidatePath(`/books/${bookId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
