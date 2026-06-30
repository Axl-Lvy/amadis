import { sliceByCodePoint } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";

import type { RefTargetType } from "./references";

// Owner-scoped corpus search powering the cross-reference mention picker (#23):
// surface passages, variants and existing placements that match a query so the
// user can choose a mention target. Read-only; every query filters by ownerId.

export type MentionCandidate = {
  type: RefTargetType;
  id: string;
  label: string;
  context: string; // e.g. book title / passage number for disambiguation
};

const PER_TYPE_LIMIT = 8;

export async function searchMentionTargets(
  ownerId: string,
  query: string,
  limit = 24,
): Promise<MentionCandidate[]> {
  const q = query.trim();
  const contains = { contains: q, mode: "insensitive" as const };

  const [passages, variants, placements] = await Promise.all([
    prisma.passage.findMany({
      where: {
        ownerId,
        ...(q ? { OR: [{ title: contains }, { text: contains }] } : {}),
      },
      orderBy: { number: "asc" },
      take: PER_TYPE_LIMIT,
      select: { id: true, number: true, title: true, book: { select: { title: true } } },
    }),
    prisma.variant.findMany({
      where: { ownerId, ...(q ? { OR: [{ label: contains }, { text: contains }] } : {}) },
      orderBy: { createdAt: "asc" },
      take: PER_TYPE_LIMIT,
      select: {
        id: true,
        label: true,
        passage: { select: { number: true, book: { select: { title: true } } } },
      },
    }),
    prisma.placement.findMany({
      where: { ownerId, ...(q ? { description: contains } : {}) },
      orderBy: { createdAt: "desc" },
      take: PER_TYPE_LIMIT,
      select: {
        id: true,
        field: true,
        start: true,
        end: true,
        description: true,
        passage: {
          select: { number: true, title: true, text: true, book: { select: { title: true } } },
        },
      },
    }),
  ]);

  const candidates: MentionCandidate[] = [];

  for (const p of passages) {
    candidates.push({
      type: "PASSAGE",
      id: p.id,
      label: `#${p.number} ${p.title}`.trim(),
      context: p.book.title,
    });
  }
  for (const v of variants) {
    candidates.push({
      type: "VARIANT",
      id: v.id,
      label: v.label || "variant",
      context: `${v.passage.book.title} · #${v.passage.number}`,
    });
  }
  for (const pl of placements) {
    const fieldText = pl.field === "TITLE" ? pl.passage.title : pl.passage.text;
    candidates.push({
      type: "PLACEMENT",
      id: pl.id,
      label: sliceByCodePoint(fieldText, pl.start, pl.end) || pl.description || "span",
      context: `${pl.passage.book.title} · #${pl.passage.number}`,
    });
  }

  return candidates.slice(0, limit);
}
