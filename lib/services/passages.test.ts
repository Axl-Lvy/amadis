import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import {
  clearPassageRegion,
  createPassage,
  deletePassage,
  reorderPassages,
  setPassageRegion,
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

describe("updatePassage", () => {
  it("updates only the owner's passage and NFC-normalizes text", async () => {
    prisma.passage.updateMany.mockResolvedValue({ count: 1 } as never);
    await updatePassage("owner-1", "p1", { title: "X", text: "é" });
    expect(prisma.passage.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", ownerId: "owner-1" },
      data: { title: "X", text: "é" },
    });
  });
  it("throws when nothing matched the owner", async () => {
    prisma.passage.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(updatePassage("owner-1", "p1", { title: "X" })).rejects.toMatchObject({
      code: "passageNotFound",
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

describe("setPassageRegion", () => {
  it("rejects a fraction outside [0,1]", async () => {
    await expect(
      setPassageRegion("owner-1", "p1", { startPage: 1, startFrac: 1.5, endPage: 2, endFrac: 0.2 }),
    ).rejects.toMatchObject({ code: "passageNumberInvalid" });
  });
  it("rejects an end before the start", async () => {
    await expect(
      setPassageRegion("owner-1", "p1", { startPage: 5, startFrac: 0.5, endPage: 5, endFrac: 0.2 }),
    ).rejects.toMatchObject({ code: "passageNumberInvalid" });
  });
  it("stores a valid multi-page region for the owner", async () => {
    prisma.passage.updateMany.mockResolvedValue({ count: 1 } as never);
    await setPassageRegion("owner-1", "p1", {
      startPage: 5,
      startFrac: 0.45,
      endPage: 7,
      endFrac: 0.25,
    });
    expect(prisma.passage.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", ownerId: "owner-1" },
      data: { startPage: 5, startFrac: 0.45, endPage: 7, endFrac: 0.25 },
    });
  });
});

describe("clearPassageRegion", () => {
  it("nulls the region for the owner", async () => {
    prisma.passage.updateMany.mockResolvedValue({ count: 1 } as never);
    await clearPassageRegion("owner-1", "p1");
    expect(prisma.passage.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", ownerId: "owner-1" },
      data: { startPage: null, startFrac: null, endPage: null, endFrac: null },
    });
  });
});
