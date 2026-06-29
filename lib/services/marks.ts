import { prisma } from "@/lib/prisma";

import { getBook } from "./books";
import { ServiceError } from "./errors";

// Owner-scoped PDF boundary marks for a book. A mark is a point (page, frac):
// `page` is 1-based, `frac` is the vertical position in [0,1] within that page.
// Marks cut the PDF into ordered areas; they carry no link to passages.

export type MarkInput = { bookId: string; page: number; frac: number };

function assertPoint(page: number, frac: number) {
  const pageOk = Number.isInteger(page) && page >= 1;
  const fracOk = typeof frac === "number" && Number.isFinite(frac) && frac >= 0 && frac <= 1;
  if (!pageOk || !fracOk) throw new ServiceError("markInvalid");
}

export async function listMarks(ownerId: string, bookId: string) {
  await getBook(ownerId, bookId);
  return prisma.mark.findMany({
    where: { ownerId, bookId },
    orderBy: [{ page: "asc" }, { frac: "asc" }],
  });
}

export async function createMark(ownerId: string, input: MarkInput) {
  await getBook(ownerId, input.bookId);
  assertPoint(input.page, input.frac);
  return prisma.mark.create({
    data: { ownerId, bookId: input.bookId, page: input.page, frac: input.frac },
  });
}

export async function updateMark(
  ownerId: string,
  id: string,
  point: { page: number; frac: number },
) {
  assertPoint(point.page, point.frac);
  const res = await prisma.mark.updateMany({
    where: { id, ownerId },
    data: { page: point.page, frac: point.frac },
  });
  if (res.count === 0) throw new ServiceError("markNotFound");
}

export async function deleteMark(ownerId: string, id: string) {
  const res = await prisma.mark.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new ServiceError("markNotFound");
}
