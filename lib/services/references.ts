import { sliceByCodePoint } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";

import { ServiceError } from "./errors";

// A description on a placement can mention another span (placement), a whole
// passage, or a variant — anywhere in the caller's corpus. The reference is
// polymorphic (targetType + targetId, no FK); ownership of both source and
// target is validated here. Owner-scoped throughout.

export const REF_TARGET_TYPES = ["PLACEMENT", "PASSAGE", "VARIANT"] as const;
export type RefTargetType = (typeof REF_TARGET_TYPES)[number];

export type ResolvedTarget = {
  type: RefTargetType;
  id: string;
  label: string;
  href: string;
  exists: boolean;
};

function normalizeTargetType(type: string): RefTargetType {
  if (type !== "PLACEMENT" && type !== "PASSAGE" && type !== "VARIANT") {
    throw new ServiceError("invalidTargetType");
  }
  return type;
}

// Confirm the polymorphic target exists and belongs to the caller.
async function assertTargetOwned(ownerId: string, type: RefTargetType, id: string) {
  let found: { id: string } | null = null;
  if (type === "PLACEMENT") {
    found = await prisma.placement.findFirst({ where: { id, ownerId }, select: { id: true } });
  } else if (type === "PASSAGE") {
    found = await prisma.passage.findFirst({ where: { id, ownerId }, select: { id: true } });
  } else {
    found = await prisma.variant.findFirst({ where: { id, ownerId }, select: { id: true } });
  }
  if (!found) throw new ServiceError("refTargetNotFound");
}

export async function createRef(
  ownerId: string,
  input: { sourceId: string; targetType: string; targetId: string },
) {
  const targetType = normalizeTargetType(input.targetType);

  const source = await prisma.placement.findFirst({
    where: { id: input.sourceId, ownerId },
    select: { id: true },
  });
  if (!source) throw new ServiceError("refSourceNotFound");

  await assertTargetOwned(ownerId, targetType, input.targetId);

  return prisma.placementRef.create({
    data: { ownerId, sourceId: input.sourceId, targetType, targetId: input.targetId },
  });
}

export async function deleteRef(ownerId: string, id: string) {
  const res = await prisma.placementRef.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new ServiceError("refTargetNotFound");
}

// Resolve a target to a display label + deep link. Missing targets (deleted out
// from under a stale ref) resolve to exists:false rather than throwing.
export async function resolveTarget(
  ownerId: string,
  type: RefTargetType,
  id: string,
): Promise<ResolvedTarget> {
  if (type === "PASSAGE") {
    const passage = await prisma.passage.findFirst({
      where: { id, ownerId },
      select: { id: true, bookId: true, number: true, title: true },
    });
    if (!passage) return { type, id, label: "", href: "#", exists: false };
    return {
      type,
      id,
      label: `#${passage.number} ${passage.title}`.trim(),
      href: `/books/${passage.bookId}/passages/${passage.id}`,
      exists: true,
    };
  }
  if (type === "VARIANT") {
    const variant = await prisma.variant.findFirst({
      where: { id, ownerId },
      select: { id: true, passageId: true, label: true },
    });
    if (!variant) return { type, id, label: "", href: "#", exists: false };
    const passage = await prisma.passage.findFirst({
      where: { id: variant.passageId, ownerId },
      select: { bookId: true },
    });
    return {
      type,
      id,
      label: variant.label || "variant",
      href: passage
        ? `/books/${passage.bookId}/passages/${variant.passageId}?variant=${variant.id}`
        : "#",
      exists: !!passage,
    };
  }
  // PLACEMENT
  const placement = await prisma.placement.findFirst({
    where: { id, ownerId },
    select: { id: true, passageId: true, field: true, start: true, end: true },
  });
  if (!placement) return { type, id, label: "", href: "#", exists: false };
  const passage = await prisma.passage.findFirst({
    where: { id: placement.passageId, ownerId },
    select: { bookId: true, title: true, text: true },
  });
  if (!passage) return { type, id, label: "", href: "#", exists: false };
  const fieldText = placement.field === "TITLE" ? passage.title : passage.text;
  return {
    type,
    id,
    label: sliceByCodePoint(fieldText, placement.start, placement.end),
    href: `/books/${passage.bookId}/passages/${placement.passageId}?placement=${placement.id}`,
    exists: true,
  };
}

// All refs whose source is the given placement, each resolved for display.
export async function listRefsFor(ownerId: string, placementId: string) {
  const refs = await prisma.placementRef.findMany({
    where: { ownerId, sourceId: placementId },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(
    refs.map(async (ref) => ({
      id: ref.id,
      targetType: ref.targetType as RefTargetType,
      targetId: ref.targetId,
      resolved: await resolveTarget(ownerId, ref.targetType as RefTargetType, ref.targetId),
    })),
  );
}

// Placements whose descriptions reference the given target ("referenced by").
export async function listBacklinks(ownerId: string, targetId: string) {
  return prisma.placementRef.findMany({
    where: { ownerId, targetId },
    orderBy: { createdAt: "asc" },
  });
}
