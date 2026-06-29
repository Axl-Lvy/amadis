import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { presignGet, presignPut } from "@/lib/r2";

import { ServiceError } from "./errors";

// Owner-scoped book operations. Framework-free: callable from server actions,
// GraphQL resolvers, or MCP tools. Every query filters by ownerId; there is no
// foreign key into the managed neon_auth schema.

export type CreateBookInput = { title: string; author?: string | null };
export type UpdateBookInput = { title?: string; author?: string | null };

// List the caller's books with passage counts and a has-PDF signal.
export function listBooks(ownerId: string) {
  return prisma.book.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      author: true,
      pdfKey: true,
      pageCount: true,
      createdAt: true,
      _count: { select: { passages: true } },
    },
  });
}

// Fetch one owned book or throw. Used as the ownership guard by other services.
export async function getBook(ownerId: string, id: string) {
  const book = await prisma.book.findFirst({ where: { id, ownerId } });
  if (!book) throw new ServiceError("bookNotFound");
  return book;
}

export async function createBook(ownerId: string, input: CreateBookInput) {
  const title = input.title?.trim();
  if (!title) throw new ServiceError("bookTitleRequired");
  const author = input.author?.trim() || null;
  return prisma.book.create({ data: { ownerId, title, author } });
}

export async function updateBook(ownerId: string, id: string, input: UpdateBookInput) {
  const data: { title?: string; author?: string | null } = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new ServiceError("bookTitleRequired");
    data.title = title;
  }
  if (input.author !== undefined) data.author = input.author?.trim() || null;

  const res = await prisma.book.updateMany({ where: { id, ownerId }, data });
  if (res.count === 0) throw new ServiceError("bookNotFound");
}

// Cascades passages -> placements/variants/placement_tag via the schema relations.
export async function deleteBook(ownerId: string, id: string) {
  const res = await prisma.book.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new ServiceError("bookNotFound");
}

// ---- PDF (per book) -------------------------------------------------------

const PDF_CONTENT_TYPE = "application/pdf";

// Presign a PUT for the book PDF. Key is namespaced by owner + book so a key can
// only ever land inside the caller's own space.
export async function presignBookPdfUpload(
  ownerId: string,
  bookId: string,
  filename: string,
) {
  await getBook(ownerId, bookId);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = `${ownerId}/${bookId}/pdf/${randomUUID()}-${safeName}`;
  const url = await presignPut(key, PDF_CONTENT_TYPE);
  return { url, key };
}

// Record the uploaded PDF key + page count after a successful browser PUT.
export async function attachBookPdf(
  ownerId: string,
  bookId: string,
  key: string,
  pageCount: number,
) {
  if (!key.startsWith(`${ownerId}/${bookId}/`)) {
    throw new ServiceError("invalidPdfKey");
  }
  if (!Number.isInteger(pageCount) || pageCount <= 0) {
    throw new ServiceError("invalidPageCount");
  }
  const res = await prisma.book.updateMany({
    where: { id: bookId, ownerId },
    data: { pdfKey: key, pageCount },
  });
  if (res.count === 0) throw new ServiceError("bookNotFound");
}

// Presigned GET URL for the book PDF (or null if none). Owner-checked.
export async function presignBookPdfView(
  ownerId: string,
  bookId: string,
): Promise<string | null> {
  const book = await prisma.book.findFirst({
    where: { id: bookId, ownerId },
    select: { pdfKey: true },
  });
  if (!book) throw new ServiceError("bookNotFound");
  return book.pdfKey ? presignGet(book.pdfKey) : null;
}

// Owner-checked PDF metadata for a same-origin streaming proxy route (so pdf.js
// fetches the bytes without needing R2 CORS configured for the deploy origin).
export async function getBookPdfMeta(ownerId: string, bookId: string) {
  const book = await prisma.book.findFirst({
    where: { id: bookId, ownerId },
    select: { pdfKey: true, pageCount: true },
  });
  if (!book) throw new ServiceError("bookNotFound");
  return book;
}
