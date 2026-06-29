import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import {
  createPlacement,
  deletePlacement,
  listPlacements,
  updatePlacement,
} from "./placements";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prisma;
  },
}));

beforeEach(() => {
  mockReset(prisma);
});

function ownPassage(fields: { title?: string; text?: string }) {
  prisma.passage.findFirst.mockResolvedValue({
    title: fields.title ?? "",
    text: fields.text ?? "",
  } as never);
}

describe("listPlacements", () => {
  it("rejects when the passage is not owned", async () => {
    prisma.passage.findFirst.mockResolvedValue(null as never);
    await expect(listPlacements("owner-1", "p1")).rejects.toMatchObject({
      code: "passageNotFound",
    });
  });
  it("scopes the query to owner + passage", async () => {
    prisma.passage.findFirst.mockResolvedValue({ id: "p1" } as never);
    prisma.placement.findMany.mockResolvedValue([] as never);
    await listPlacements("owner-1", "p1");
    expect(prisma.placement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-1", passageId: "p1" } }),
    );
  });
});

describe("createPlacement", () => {
  it("rejects an invalid field", async () => {
    await expect(
      createPlacement("owner-1", { passageId: "p1", field: "BODY", start: 0, end: 1, tagIds: ["t1"] }),
    ).rejects.toMatchObject({ code: "invalidField" });
  });

  it("rejects an empty placement (no tags and no description)", async () => {
    await expect(
      createPlacement("owner-1", { passageId: "p1", field: "TEXT", start: 0, end: 1 }),
    ).rejects.toMatchObject({ code: "emptyPlacement" });
  });

  it("validates the span in code points, not UTF-16 units", async () => {
    // "a😀b" is 3 code points but 4 UTF-16 units; end=3 must be valid.
    ownPassage({ text: "a😀b" });
    prisma.tag.count.mockResolvedValue(1 as never);
    prisma.placement.create.mockResolvedValue({ id: "pl1", tags: [] } as never);
    await createPlacement("owner-1", {
      passageId: "p1",
      field: "TEXT",
      start: 0,
      end: 3,
      tagIds: ["t1"],
    });
    expect(prisma.placement.create).toHaveBeenCalled();
  });

  it("rejects an out-of-range span", async () => {
    ownPassage({ text: "abc" });
    await expect(
      createPlacement("owner-1", {
        passageId: "p1",
        field: "TEXT",
        start: 0,
        end: 99,
        description: "x",
      }),
    ).rejects.toMatchObject({ code: "invalidSpan" });
  });

  it("rejects tags the caller does not own", async () => {
    ownPassage({ text: "abcdef" });
    prisma.tag.count.mockResolvedValue(1 as never); // only 1 of 2 owned
    await expect(
      createPlacement("owner-1", {
        passageId: "p1",
        field: "TEXT",
        start: 0,
        end: 2,
        tagIds: ["t1", "t2"],
      }),
    ).rejects.toMatchObject({ code: "tagNotFound" });
  });

  it("allows a tagless description-only placement and stamps ownerId on tags", async () => {
    ownPassage({ title: "Le Chevalier", text: "" });
    prisma.placement.create.mockResolvedValue({ id: "pl1", tags: [] } as never);
    await createPlacement("owner-1", {
      passageId: "p1",
      field: "TITLE",
      start: 0,
      end: 2,
      description: "  gloss  ",
    });
    expect(prisma.placement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: "owner-1",
          passageId: "p1",
          field: "TITLE",
          description: "gloss",
          tags: { create: [] },
        }),
      }),
    );
  });
});

describe("updatePlacement", () => {
  it("rejects emptying a placement of both tags and description", async () => {
    prisma.placement.findFirst.mockResolvedValue({
      id: "pl1",
      description: "old",
      tags: [{ tagId: "t1" }],
    } as never);
    await expect(
      updatePlacement("owner-1", "pl1", { tagIds: [], description: "" }),
    ).rejects.toMatchObject({ code: "emptyPlacement" });
  });

  it("replaces tags within a transaction, owner-scoped", async () => {
    prisma.placement.findFirst.mockResolvedValue({
      id: "pl1",
      description: "old",
      tags: [{ tagId: "t1" }],
    } as never);
    prisma.tag.count.mockResolvedValue(1 as never);
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    prisma.placement.update.mockResolvedValue({} as never);
    prisma.placementTag.deleteMany.mockResolvedValue({ count: 1 } as never);
    prisma.placementTag.createMany.mockResolvedValue({ count: 1 } as never);

    await updatePlacement("owner-1", "pl1", { tagIds: ["t2"], description: "new" });

    expect(prisma.placementTag.deleteMany).toHaveBeenCalledWith({
      where: { placementId: "pl1", ownerId: "owner-1" },
    });
    expect(prisma.placementTag.createMany).toHaveBeenCalledWith({
      data: [{ placementId: "pl1", tagId: "t2", ownerId: "owner-1" }],
    });
  });

  it("throws when the placement is not owned", async () => {
    prisma.placement.findFirst.mockResolvedValue(null as never);
    await expect(updatePlacement("owner-1", "pl1", { description: "x" })).rejects.toMatchObject({
      code: "placementNotFound",
    });
  });
});

describe("deletePlacement", () => {
  it("deletes only the owner's placement", async () => {
    prisma.placement.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deletePlacement("owner-1", "pl1");
    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { id: "pl1", ownerId: "owner-1" },
    });
  });
});
