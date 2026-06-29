import { toNFC } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";

import { getBook } from "./books";
import { ServiceError } from "./errors";

// Owner-scoped passage operations. A passage belongs to a book the caller owns;
// every mutation confirms book ownership and stamps ownerId. Title and text are
// NFC-normalized on save so code-point offsets stay stable across client/server.

export type CreatePassageInput = {
  bookId: string;
  number?: number;
  title?: string;
  text?: string;
  region?: PassageRegion;
};
export type UpdatePassageInput = {
  number?: number;
  title?: string;
  text?: string;
};
export type PassageRegion = {
  startPage: number;
  startFrac: number;
  endPage: number;
  endFrac: number;
};

// Validate a continuous PDF region: 1-based pages, fractions in [0,1], and the
// end never before the start. Throws passageNumberInvalid on a bad region.
function assertRegion(region: PassageRegion) {
  const { startPage, startFrac, endPage, endFrac } = region;
  const fracOk = (f: number) => typeof f === "number" && f >= 0 && f <= 1;
  const pageOk = (p: number) => Number.isInteger(p) && p >= 1;
  if (
    !pageOk(startPage) ||
    !pageOk(endPage) ||
    !fracOk(startFrac) ||
    !fracOk(endFrac) ||
    endPage < startPage ||
    (endPage === startPage && endFrac < startFrac)
  ) {
    throw new ServiceError("passageNumberInvalid");
  }
}

// List a book's passages ordered by number (book ownership confirmed first).
export async function listPassages(ownerId: string, bookId: string) {
  await getBook(ownerId, bookId);
  return prisma.passage.findMany({
    where: { ownerId, bookId },
    orderBy: { number: "asc" },
  });
}

export async function getPassage(ownerId: string, id: string) {
  const passage = await prisma.passage.findFirst({ where: { id, ownerId } });
  if (!passage) throw new ServiceError("passageNotFound");
  return passage;
}

export async function createPassage(ownerId: string, input: CreatePassageInput) {
  await getBook(ownerId, input.bookId);

  let number = input.number;
  if (number === undefined || number === null) {
    const max = await prisma.passage.aggregate({
      where: { ownerId, bookId: input.bookId },
      _max: { number: true },
    });
    number = (max._max.number ?? 0) + 1;
  }
  if (!Number.isInteger(number) || number < 0) {
    throw new ServiceError("passageNumberInvalid");
  }
  if (input.region) assertRegion(input.region);

  return prisma.passage.create({
    data: {
      ownerId,
      bookId: input.bookId,
      number,
      title: toNFC(input.title ?? ""),
      text: toNFC(input.text ?? ""),
      ...(input.region
        ? {
            startPage: input.region.startPage,
            startFrac: input.region.startFrac,
            endPage: input.region.endPage,
            endFrac: input.region.endFrac,
          }
        : {}),
    },
  });
}

export async function updatePassage(
  ownerId: string,
  id: string,
  input: UpdatePassageInput,
) {
  const data: { number?: number; title?: string; text?: string } = {};
  if (input.number !== undefined) {
    if (!Number.isInteger(input.number) || input.number < 0) {
      throw new ServiceError("passageNumberInvalid");
    }
    data.number = input.number;
  }
  if (input.title !== undefined) data.title = toNFC(input.title);
  if (input.text !== undefined) data.text = toNFC(input.text);

  const res = await prisma.passage.updateMany({ where: { id, ownerId }, data });
  if (res.count === 0) throw new ServiceError("passageNotFound");
}

export async function deletePassage(ownerId: string, id: string) {
  const res = await prisma.passage.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new ServiceError("passageNotFound");
}

// Renumber passages within a book to match the given id order (1-based). Only the
// caller's passages in the given book are touched; unknown ids are ignored.
export async function reorderPassages(
  ownerId: string,
  bookId: string,
  orderedIds: string[],
) {
  await getBook(ownerId, bookId);
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.passage.updateMany({
        where: { id, ownerId, bookId },
        data: { number: index + 1 },
      }),
    ),
  );
}

// Set / clear a passage's continuous PDF region (used by the segmenter, #21).
export async function setPassageRegion(
  ownerId: string,
  id: string,
  region: PassageRegion,
) {
  assertRegion(region);
  const res = await prisma.passage.updateMany({
    where: { id, ownerId },
    data: {
      startPage: region.startPage,
      startFrac: region.startFrac,
      endPage: region.endPage,
      endFrac: region.endFrac,
    },
  });
  if (res.count === 0) throw new ServiceError("passageNotFound");
}

export async function clearPassageRegion(ownerId: string, id: string) {
  const res = await prisma.passage.updateMany({
    where: { id, ownerId },
    data: { startPage: null, startFrac: null, endPage: null, endFrac: null },
  });
  if (res.count === 0) throw new ServiceError("passageNotFound");
}
