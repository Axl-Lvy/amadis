import { codePointLength } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";

import { ServiceError } from "./errors";

// A placement is a span on a passage's title OR text carrying 0..n tags + an
// optional free description. Tagless (description-only) placements are allowed,
// but a placement must have at least one tag or a non-empty description. Offsets
// are Unicode code-point indices into the relevant NFC-normalized field,
// `start` inclusive, `end` exclusive. Overlaps are allowed. Owner-scoped.

export const PLACEMENT_FIELDS = ["TITLE", "TEXT"] as const;
export type PlacementField = (typeof PLACEMENT_FIELDS)[number];

export type CreatePlacementInput = {
  passageId: string;
  field: PlacementField | string;
  start: number;
  end: number;
  tagIds?: string[];
  description?: string | null;
};
export type UpdatePlacementInput = {
  tagIds?: string[];
  description?: string | null;
};

function normalizeField(field: string): PlacementField {
  if (field !== "TITLE" && field !== "TEXT") throw new ServiceError("invalidField");
  return field;
}

function cleanDescription(description?: string | null): string | null {
  const trimmed = description?.trim();
  return trimmed ? trimmed : null;
}

function dedupe(ids?: string[]): string[] {
  return [...new Set((ids ?? []).filter(Boolean))];
}

// Validate the span against the code-point length of the passage's chosen field.
function assertSpan(start: number, end: number, fieldText: string) {
  const len = codePointLength(fieldText);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > len ||
    start >= end
  ) {
    throw new ServiceError("invalidSpan");
  }
}

// Confirm every tag id belongs to the caller (no cross-user tag references).
async function assertTagsOwned(ownerId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const count = await prisma.tag.count({ where: { id: { in: tagIds }, ownerId } });
  if (count !== tagIds.length) throw new ServiceError("tagNotFound");
}

// List a passage's placements with their tags (passage ownership confirmed).
export async function listPlacements(ownerId: string, passageId: string) {
  const passage = await prisma.passage.findFirst({
    where: { id: passageId, ownerId },
    select: { id: true },
  });
  if (!passage) throw new ServiceError("passageNotFound");

  return prisma.placement.findMany({
    where: { ownerId, passageId },
    orderBy: [{ field: "asc" }, { start: "asc" }, { end: "asc" }],
    include: { tags: { select: { tagId: true } } },
  });
}

export async function getPlacement(ownerId: string, id: string) {
  const placement = await prisma.placement.findFirst({
    where: { id, ownerId },
    include: { tags: { select: { tagId: true } } },
  });
  if (!placement) throw new ServiceError("placementNotFound");
  return placement;
}

export async function createPlacement(ownerId: string, input: CreatePlacementInput) {
  const field = normalizeField(input.field);
  const tagIds = dedupe(input.tagIds);
  const description = cleanDescription(input.description);
  if (tagIds.length === 0 && !description) throw new ServiceError("emptyPlacement");

  const passage = await prisma.passage.findFirst({
    where: { id: input.passageId, ownerId },
    select: { title: true, text: true },
  });
  if (!passage) throw new ServiceError("passageNotFound");

  assertSpan(input.start, input.end, field === "TITLE" ? passage.title : passage.text);
  await assertTagsOwned(ownerId, tagIds);

  return prisma.placement.create({
    data: {
      ownerId,
      passageId: input.passageId,
      field,
      start: input.start,
      end: input.end,
      description,
      tags: { create: tagIds.map((tagId) => ({ ownerId, tagId })) },
    },
    include: { tags: { select: { tagId: true } } },
  });
}

// Replace tags and/or description on an owned placement. Re-validates non-empty.
export async function updatePlacement(
  ownerId: string,
  id: string,
  input: UpdatePlacementInput,
) {
  const existing = await prisma.placement.findFirst({
    where: { id, ownerId },
    include: { tags: { select: { tagId: true } } },
  });
  if (!existing) throw new ServiceError("placementNotFound");

  const nextTagIds = input.tagIds !== undefined ? dedupe(input.tagIds) : existing.tags.map((t) => t.tagId);
  const nextDescription =
    input.description !== undefined ? cleanDescription(input.description) : existing.description;
  if (nextTagIds.length === 0 && !nextDescription) throw new ServiceError("emptyPlacement");

  if (input.tagIds !== undefined) await assertTagsOwned(ownerId, nextTagIds);

  await prisma.$transaction(async (tx) => {
    await tx.placement.update({ where: { id }, data: { description: nextDescription } });
    if (input.tagIds !== undefined) {
      await tx.placementTag.deleteMany({ where: { placementId: id, ownerId } });
      if (nextTagIds.length > 0) {
        await tx.placementTag.createMany({
          data: nextTagIds.map((tagId) => ({ placementId: id, tagId, ownerId })),
        });
      }
    }
  });
}

export async function deletePlacement(ownerId: string, id: string) {
  const res = await prisma.placement.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new ServiceError("placementNotFound");
}
