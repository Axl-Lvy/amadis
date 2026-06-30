import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import {
  createPassage,
  deletePassage,
  getPassage,
  listPassages,
  reorderPassages,
  updatePassage,
} from "./passages";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prisma;
  },
}));
vi.mock("@/lib/r2", () => ({ presignPut: vi.fn(), presignGet: vi.fn() }));

beforeEach(() => {
  mockReset(prisma);
  vi.clearAllMocks();
});

function ownBook() {
  prisma.book.findFirst.mockResolvedValue({ id: "b1", ownerId: "owner-1" } as never);
}

describe("createPassage", () => {
  it("rejects when the parent book is not owned", async () => {
    prisma.book.findFirst.mockResolvedValue(null as never);
    await expect(createPassage("owner-1", { bookId: "b1" })).rejects.toMatchObject({
      code: "bookNotFound",
    });
    expect(prisma.passage.create).not.toHaveBeenCalled();
  });

  it("auto-numbers, NFC-normalizes and stamps ownerId", async () => {
    ownBook();
    prisma.passage.aggregate.mockResolvedValue({ _max: { number: 4 } } as never);
    prisma.passage.create.mockResolvedValue({ id: "p1" } as never);
    // "e" + combining acute (NFD) must be stored as composed "é" (NFC).
    await createPassage("owner-1", { bookId: "b1", title: "Titre", text: "é" });
    expect(prisma.passage.create).toHaveBeenCalledWith({
      data: { ownerId: "owner-1", bookId: "b1", number: 5, title: "Titre", text: "é" },
    });
  });
});

describe("createPassage (numbering)", () => {
  it("starts numbering at 1 when the book has no passages yet", async () => {
    ownBook();
    prisma.passage.aggregate.mockResolvedValue({ _max: { number: null } } as never);
    prisma.passage.create.mockResolvedValue({ id: "p1" } as never);
    await createPassage("owner-1", { bookId: "b1" });
    expect(prisma.passage.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-1", bookId: "b1" } }),
    );
    expect(prisma.passage.create).toHaveBeenCalledWith({
      data: { ownerId: "owner-1", bookId: "b1", number: 1, title: "", text: "" },
    });
  });

  it("rejects a negative explicit number", async () => {
    ownBook();
    await expect(
      createPassage("owner-1", { bookId: "b1", number: -1 }),
    ).rejects.toMatchObject({ code: "passageNumberInvalid" });
    expect(prisma.passage.create).not.toHaveBeenCalled();
  });
});

describe("listPassages", () => {
  it("confirms book ownership then lists the book's passages ordered by number", async () => {
    ownBook();
    prisma.passage.findMany.mockResolvedValue([] as never);
    await listPassages("owner-1", "b1");
    expect(prisma.book.findFirst).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: "owner-1" },
    });
    expect(prisma.passage.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", bookId: "b1" },
      orderBy: { number: "asc" },
    });
  });

  it("rejects when the parent book is not owned", async () => {
    prisma.book.findFirst.mockResolvedValue(null as never);
    await expect(listPassages("owner-1", "b1")).rejects.toMatchObject({
      code: "bookNotFound",
    });
    expect(prisma.passage.findMany).not.toHaveBeenCalled();
  });
});

describe("getPassage", () => {
  it("returns the owner's passage", async () => {
    prisma.passage.findFirst.mockResolvedValue({ id: "p1", ownerId: "owner-1" } as never);
    const out = await getPassage("owner-1", "p1");
    expect(out).toMatchObject({ id: "p1" });
    expect(prisma.passage.findFirst).toHaveBeenCalledWith({
      where: { id: "p1", ownerId: "owner-1" },
    });
  });

  it("throws when the passage is not owned", async () => {
    prisma.passage.findFirst.mockResolvedValue(null as never);
    await expect(getPassage("owner-1", "p1")).rejects.toMatchObject({
      code: "passageNotFound",
    });
  });
});

describe("updatePassage", () => {
  function existing(text: string, title = "") {
    prisma.passage.findFirst.mockResolvedValue({ id: "p1", title, text } as never);
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
    prisma.passage.update.mockResolvedValue({ id: "p1" } as never);
  }

  it("throws when the passage is not owned", async () => {
    prisma.passage.findFirst.mockResolvedValue(null as never);
    await expect(updatePassage("owner-1", "p1", { title: "X" })).rejects.toMatchObject({
      code: "passageNotFound",
    });
  });

  it("updates without touching placements when neither title nor text changes", async () => {
    // title already "X" and text already "hello" -> no field edits -> no remap.
    existing("hello", "X");
    await updatePassage("owner-1", "p1", { title: "X", text: "hello" });
    expect(prisma.passage.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { title: "X", text: "hello" },
    });
    expect(prisma.placement.findMany).not.toHaveBeenCalled();
  });

  it("remaps TEXT placements when the text changes and persists new offsets", async () => {
    existing("abcde");
    // insert "XY" at offset 2 -> "abXYcde"; placement [1,4) -> [1,6)
    prisma.placement.findMany.mockResolvedValue([
      { id: "pl1", start: 1, end: 4 },
    ] as never);
    prisma.placement.update.mockResolvedValue({} as never);
    await updatePassage("owner-1", "p1", { text: "abXYcde" });
    expect(prisma.placement.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", passageId: "p1", field: "TEXT" },
      select: { id: true, start: true, end: true },
    });
    expect(prisma.placement.update).toHaveBeenCalledWith({
      where: { id: "pl1" },
      data: { start: 1, end: 6 },
    });
  });

  it("deletes placements that collapse to nothing", async () => {
    existing("abcdef");
    // "abcdef" -> "af": delete "bcde"; placement [1,5) collapses
    prisma.placement.findMany.mockResolvedValue([
      { id: "pl1", start: 1, end: 5 },
    ] as never);
    prisma.placement.deleteMany.mockResolvedValue({ count: 1 } as never);
    await updatePassage("owner-1", "p1", { text: "af" });
    expect(prisma.placement.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["pl1"] }, ownerId: "owner-1" },
    });
    expect(prisma.placement.update).not.toHaveBeenCalled();
  });

  it("rejects an invalid explicit number", async () => {
    existing("x");
    await expect(updatePassage("owner-1", "p1", { number: -1 })).rejects.toMatchObject({
      code: "passageNumberInvalid",
    });
  });
});

describe("deletePassage", () => {
  it("deletes only the owner's passage", async () => {
    prisma.passage.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deletePassage("owner-1", "p1");
    expect(prisma.passage.deleteMany).toHaveBeenCalledWith({
      where: { id: "p1", ownerId: "owner-1" },
    });
  });
});

describe("reorderPassages", () => {
  it("renumbers only the owner's passages in the book", async () => {
    ownBook();
    prisma.passage.updateMany.mockResolvedValue({ count: 1 } as never);
    prisma.$transaction.mockResolvedValue([] as never);
    await reorderPassages("owner-1", "b1", ["p2", "p1"]);
    expect(prisma.passage.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "p2", ownerId: "owner-1", bookId: "b1" },
      data: { number: 1 },
    });
    expect(prisma.passage.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "p1", ownerId: "owner-1", bookId: "b1" },
      data: { number: 2 },
    });
  });
});
