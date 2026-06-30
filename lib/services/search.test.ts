import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { searchMentionTargets } from "./search";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prisma;
  },
}));

beforeEach(() => {
  mockReset(prisma);
});

describe("searchMentionTargets", () => {
  it("builds candidates for passages, variants and placements with a query", async () => {
    prisma.passage.findMany.mockResolvedValue([
      { id: "p1", number: 3, title: "Le Chevalier", book: { title: "Roland" } },
    ] as never);
    prisma.variant.findMany.mockResolvedValue([
      { id: "v1", label: "alt", passage: { number: 5, book: { title: "Tristan" } } },
    ] as never);
    prisma.placement.findMany.mockResolvedValue([
      {
        id: "pl1",
        field: "TEXT",
        start: 0,
        end: 3,
        description: "gloss",
        passage: { number: 7, title: "Titre", text: "abcdef", book: { title: "Yvain" } },
      },
    ] as never);

    const out = await searchMentionTargets("owner-1", "che");

    expect(out).toEqual([
      { type: "PASSAGE", id: "p1", label: "#3 Le Chevalier", context: "Roland" },
      { type: "VARIANT", id: "v1", label: "alt", context: "Tristan · #5" },
      { type: "PLACEMENT", id: "pl1", label: "abc", context: "Yvain · #7" },
    ]);
  });

  it("scopes every query to the owner and applies the OR/contains filter when a query is given", async () => {
    prisma.passage.findMany.mockResolvedValue([] as never);
    prisma.variant.findMany.mockResolvedValue([] as never);
    prisma.placement.findMany.mockResolvedValue([] as never);

    await searchMentionTargets("owner-1", "  che  ");

    const contains = { contains: "che", mode: "insensitive" };
    expect(prisma.passage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1", OR: [{ title: contains }, { text: contains }] },
        take: 8,
      }),
    );
    expect(prisma.variant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1", OR: [{ label: contains }, { text: contains }] },
      }),
    );
    expect(prisma.placement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1", description: contains },
      }),
    );
  });

  it("drops the contains filter for an empty query but stays owner-scoped", async () => {
    prisma.passage.findMany.mockResolvedValue([] as never);
    prisma.variant.findMany.mockResolvedValue([] as never);
    prisma.placement.findMany.mockResolvedValue([] as never);

    await searchMentionTargets("owner-1", "   ");

    expect(prisma.passage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-1" } }),
    );
    expect(prisma.variant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-1" } }),
    );
    expect(prisma.placement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-1" } }),
    );
  });

  it("falls back from the span to the description, then to 'span', for a placement", async () => {
    prisma.passage.findMany.mockResolvedValue([] as never);
    prisma.variant.findMany.mockResolvedValue([] as never);
    prisma.placement.findMany.mockResolvedValue([
      // TITLE field, empty title text -> empty slice -> falls back to description.
      {
        id: "pl1",
        field: "TITLE",
        start: 0,
        end: 2,
        description: "desc-fallback",
        passage: { number: 1, title: "", text: "ignored", book: { title: "B" } },
      },
      // empty slice and no description -> "span".
      {
        id: "pl2",
        field: "TEXT",
        start: 0,
        end: 0,
        description: null,
        passage: { number: 2, title: "t", text: "", book: { title: "B" } },
      },
    ] as never);

    const out = await searchMentionTargets("owner-1", "");
    expect(out[0]).toMatchObject({ id: "pl1", label: "desc-fallback" });
    expect(out[1]).toMatchObject({ id: "pl2", label: "span" });
  });

  it("uses 'variant' when a variant has no label", async () => {
    prisma.passage.findMany.mockResolvedValue([] as never);
    prisma.variant.findMany.mockResolvedValue([
      { id: "v1", label: "", passage: { number: 4, book: { title: "B" } } },
    ] as never);
    prisma.placement.findMany.mockResolvedValue([] as never);

    const out = await searchMentionTargets("owner-1", "");
    expect(out[0]).toMatchObject({ type: "VARIANT", label: "variant" });
  });

  it("respects the overall limit across the combined candidate list", async () => {
    prisma.passage.findMany.mockResolvedValue([
      { id: "p1", number: 1, title: "A", book: { title: "B" } },
      { id: "p2", number: 2, title: "C", book: { title: "B" } },
    ] as never);
    prisma.variant.findMany.mockResolvedValue([
      { id: "v1", label: "v", passage: { number: 3, book: { title: "B" } } },
    ] as never);
    prisma.placement.findMany.mockResolvedValue([] as never);

    const out = await searchMentionTargets("owner-1", "", 2);
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.id)).toEqual(["p1", "p2"]);
  });
});
