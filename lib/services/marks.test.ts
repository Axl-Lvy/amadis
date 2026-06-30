import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { createMark, deleteMark, listMarks, updateMark } from "./marks";

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

describe("listMarks", () => {
  it("confirms book ownership then lists marks ordered by page then frac", async () => {
    ownBook();
    prisma.mark.findMany.mockResolvedValue([] as never);
    await listMarks("owner-1", "b1");
    expect(prisma.book.findFirst).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: "owner-1" },
    });
    expect(prisma.mark.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", bookId: "b1" },
      orderBy: [{ page: "asc" }, { frac: "asc" }],
    });
  });

  it("rejects when the parent book is not owned", async () => {
    prisma.book.findFirst.mockResolvedValue(null as never);
    await expect(listMarks("owner-1", "b1")).rejects.toMatchObject({ code: "bookNotFound" });
    expect(prisma.mark.findMany).not.toHaveBeenCalled();
  });
});

describe("createMark", () => {
  it("creates a mark for the owner after confirming the book", async () => {
    ownBook();
    prisma.mark.create.mockResolvedValue({ id: "m1" } as never);
    await createMark("owner-1", { bookId: "b1", page: 2, frac: 0.5 });
    expect(prisma.mark.create).toHaveBeenCalledWith({
      data: { ownerId: "owner-1", bookId: "b1", page: 2, frac: 0.5 },
    });
  });

  it.each([
    { page: 0, frac: 0.5 },
    { page: 1.5, frac: 0.5 },
    { page: 1, frac: -0.1 },
    { page: 1, frac: 1.1 },
  ])("rejects invalid point %o without writing", async (point) => {
    ownBook();
    await expect(createMark("owner-1", { bookId: "b1", ...point })).rejects.toMatchObject({
      code: "markInvalid",
    });
    expect(prisma.mark.create).not.toHaveBeenCalled();
  });

  it("rejects when the parent book is not owned", async () => {
    prisma.book.findFirst.mockResolvedValue(null as never);
    await expect(
      createMark("owner-1", { bookId: "b1", page: 1, frac: 0.5 }),
    ).rejects.toMatchObject({ code: "bookNotFound" });
  });
});

describe("updateMark", () => {
  it("updates only the owner's mark", async () => {
    prisma.mark.updateMany.mockResolvedValue({ count: 1 } as never);
    await updateMark("owner-1", "m1", { page: 3, frac: 0.2 });
    expect(prisma.mark.updateMany).toHaveBeenCalledWith({
      where: { id: "m1", ownerId: "owner-1" },
      data: { page: 3, frac: 0.2 },
    });
  });

  it("throws markInvalid for a bad point without writing", async () => {
    await expect(updateMark("owner-1", "m1", { page: 1, frac: 2 })).rejects.toMatchObject({
      code: "markInvalid",
    });
    expect(prisma.mark.updateMany).not.toHaveBeenCalled();
  });

  it("throws markNotFound when nothing matched", async () => {
    prisma.mark.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(updateMark("owner-1", "m1", { page: 1, frac: 0.5 })).rejects.toMatchObject({
      code: "markNotFound",
    });
  });
});

describe("deleteMark", () => {
  it("deletes only the owner's mark", async () => {
    prisma.mark.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deleteMark("owner-1", "m1");
    expect(prisma.mark.deleteMany).toHaveBeenCalledWith({
      where: { id: "m1", ownerId: "owner-1" },
    });
  });

  it("throws markNotFound when nothing matched", async () => {
    prisma.mark.deleteMany.mockResolvedValue({ count: 0 } as never);
    await expect(deleteMark("owner-1", "m1")).rejects.toMatchObject({ code: "markNotFound" });
  });
});
