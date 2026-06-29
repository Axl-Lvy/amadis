"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getString } from "@/lib/forms";
import { requireUserId } from "@/lib/session";
import { createBook, deleteBook, updateBook } from "@/lib/services/books";

// Books-list mutations. These are mounted as plain `<form action={...}>`
// handlers, so on a service error they throw (the list page re-renders);
// the programmatic editors that need an inline message live under
// app/(app)/books/[id]/actions.ts and return the {ok,error} result shape.

// Create a book from the list form (title required, author optional), then
// jump straight into the new book so the user can start adding passages.
export async function createBookAction(formData: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const title = getString(formData, "title");
  const author = getString(formData, "author");
  const book = await createBook(ownerId, { title, author: author || null });
  revalidatePath("/books");
  redirect(`/books/${book.id}`);
}

// Delete a book (cascades passages/placements/variants in the service).
export async function deleteBookAction(formData: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const id = getString(formData, "id");
  await deleteBook(ownerId, id);
  revalidatePath("/books");
}

// Rename / re-attribute a book from the list (e.g. an inline edit), kept here
// for completeness; the detail page uses the result-returning wrapper instead.
export async function updateBookAction(formData: FormData): Promise<void> {
  const ownerId = await requireUserId();
  const id = getString(formData, "id");
  const title = getString(formData, "title");
  const author = getString(formData, "author");
  await updateBook(ownerId, id, { title, author: author || null });
  revalidatePath("/books");
  revalidatePath(`/books/${id}`);
}
