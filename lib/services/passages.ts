import { toNFC } from "@/lib/offsets";
import { remapPlacements } from "@/lib/offset-remap";
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
};
export type UpdatePassageInput = {
  number?: number;
  title?: string;
  text?: string;
};

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

  return prisma.passage.create({
    data: {
      ownerId,
      bookId: input.bookId,
      number,
      title: toNFC(input.title ?? ""),
      text: toNFC(input.text ?? ""),
    },
  });
}

// Update a passage's number / title / text. When title or text changes, the
// field's placement spans are REMAPPED (not dropped) to follow the edit; spans
// whose text was entirely deleted collapse and are removed. All in one
// transaction so offsets never desync from the text.
export async function updatePassage(
  ownerId: string,
  id: string,
  input: UpdatePassageInput,
) {
  const existing = await prisma.passage.findFirst({
    where: { id, ownerId },
    select: { id: true, title: true, text: true },
  });
  if (!existing) throw new ServiceError("passageNotFound");

  const data: { number?: number; title?: string; text?: string } = {};
  if (input.number !== undefined) {
    if (!Number.isInteger(input.number) || input.number < 0) {
      throw new ServiceError("passageNumberInvalid");
    }
    data.number = input.number;
  }

  const fieldEdits: { field: "TITLE" | "TEXT"; oldText: string; newText: string }[] = [];
  if (input.title !== undefined) {
    const next = toNFC(input.title);
    data.title = next;
    if (next !== existing.title) {
      fieldEdits.push({ field: "TITLE", oldText: existing.title, newText: next });
    }
  }
  if (input.text !== undefined) {
    const next = toNFC(input.text);
    data.text = next;
    if (next !== existing.text) {
      fieldEdits.push({ field: "TEXT", oldText: existing.text, newText: next });
    }
  }

  // No text/title content change: a plain update is enough.
  if (fieldEdits.length === 0) {
    await prisma.passage.update({ where: { id }, data });
    return;
  }

  // Compute remaps before opening the transaction.
  const updates: { id: string; start: number; end: number }[] = [];
  const drops: string[] = [];
  for (const edit of fieldEdits) {
    const spans = await prisma.placement.findMany({
      where: { ownerId, passageId: id, field: edit.field },
      select: { id: true, start: true, end: true },
    });
    const { updated, dropped } = remapPlacements(edit.oldText, edit.newText, spans);
    for (const u of updated) {
      // Skip no-op updates to keep the transaction lean.
      const before = spans.find((s) => s.id === u.id);
      if (!before || before.start !== u.start || before.end !== u.end) updates.push(u);
    }
    drops.push(...dropped);
  }

  await prisma.$transaction(async (tx) => {
    await tx.passage.update({ where: { id }, data });
    for (const u of updates) {
      await tx.placement.update({ where: { id: u.id }, data: { start: u.start, end: u.end } });
    }
    if (drops.length > 0) {
      await tx.placement.deleteMany({ where: { id: { in: drops }, ownerId } });
    }
  });
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
