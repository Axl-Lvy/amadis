import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { presignGet, presignPut } from "@/lib/r2";

import {
  attachBookPdf,
  createBook,
  deleteBook,
  getBook,
  listBooks,
  presignBookPdfUpload,
  presignBookPdfView,
  updateBook,
} from "./books";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prisma;
  },
}));
vi.mock("@/lib/r2", () => ({
  presignPut: vi.fn(() => Promise.resolve("https://signed/put")),
  presignGet: vi.fn(() => Promise.resolve("https://signed/get")),
}));

beforeEach(() => {
  mockReset(prisma);
  vi.clearAllMocks();
});

describe("listBooks", () => {
  it("scopes to the owner", async () => {
    prisma.book.findMany.mockResolvedValue([] as never);
    await listBooks("owner-1");
    expect(prisma.book.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "owner-1" } }),
    );
  });
});

describe("createBook", () => {
  it("requires a title", async () => {
    await expect(createBook("owner-1", { title: "   " })).rejects.toMatchObject({
      code: "bookTitleRequired",
    });
    expect(prisma.book.create).not.toHaveBeenCalled();
  });

  it("stamps ownerId and trims fields", async () => {
    prisma.book.create.mockResolvedValue({ id: "b1" } as never);
    await createBook("owner-1", { title: "  Roland  ", author: "  Turold " });
    expect(prisma.book.create).toHaveBeenCalledWith({
      data: { ownerId: "owner-1", title: "Roland", author: "Turold" },
    });
  });
});

describe("getBook", () => {
  it("throws when not owned", async () => {
    prisma.book.findFirst.mockResolvedValue(null as never);
    await expect(getBook("owner-1", "b1")).rejects.toMatchObject({ code: "bookNotFound" });
    expect(prisma.book.findFirst).toHaveBeenCalledWith({ where: { id: "b1", ownerId: "owner-1" } });
  });
});

describe("updateBook", () => {
  it("rejects an empty title", async () => {
    await expect(updateBook("owner-1", "b1", { title: " " })).rejects.toMatchObject({
      code: "bookTitleRequired",
    });
  });
  it("updates only the owner's book", async () => {
    prisma.book.updateMany.mockResolvedValue({ count: 1 } as never);
    await updateBook("owner-1", "b1", { title: "New", author: "" });
    expect(prisma.book.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: "owner-1" },
      data: { title: "New", author: null },
    });
  });
  it("throws when nothing matched the owner", async () => {
    prisma.book.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(updateBook("owner-1", "b1", { title: "x" })).rejects.toMatchObject({
      code: "bookNotFound",
    });
  });
});

describe("deleteBook", () => {
  it("deletes only the owner's book", async () => {
    prisma.book.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deleteBook("owner-1", "b1");
    expect(prisma.book.deleteMany).toHaveBeenCalledWith({ where: { id: "b1", ownerId: "owner-1" } });
  });
  it("throws when nothing matched the owner", async () => {
    prisma.book.deleteMany.mockResolvedValue({ count: 0 } as never);
    await expect(deleteBook("owner-1", "b1")).rejects.toMatchObject({ code: "bookNotFound" });
  });
});

describe("presignBookPdfUpload", () => {
  it("namespaces the key by owner and book and signs a PUT", async () => {
    prisma.book.findFirst.mockResolvedValue({ id: "b1" } as never);
    const { url, key } = await presignBookPdfUpload("owner-1", "b1", "My Book!.pdf");
    expect(url).toBe("https://signed/put");
    expect(key).toMatch(/^owner-1\/b1\/pdf\/.*My_Book_\.pdf$/);
    expect(presignPut).toHaveBeenCalledWith(key, "application/pdf");
  });
  it("rejects when the book is not owned", async () => {
    prisma.book.findFirst.mockResolvedValue(null as never);
    await expect(presignBookPdfUpload("owner-1", "b1", "x.pdf")).rejects.toMatchObject({
      code: "bookNotFound",
    });
  });
});

describe("attachBookPdf", () => {
  it("rejects a key outside the caller's namespace", async () => {
    await expect(attachBookPdf("owner-1", "b1", "other/b1/pdf/x.pdf", 3)).rejects.toMatchObject({
      code: "invalidPdfKey",
    });
    expect(prisma.book.updateMany).not.toHaveBeenCalled();
  });
  it("rejects a non-positive page count", async () => {
    await expect(attachBookPdf("owner-1", "b1", "owner-1/b1/pdf/x.pdf", 0)).rejects.toMatchObject({
      code: "invalidPageCount",
    });
  });
  it("records the key and page count for the owner", async () => {
    prisma.book.updateMany.mockResolvedValue({ count: 1 } as never);
    await attachBookPdf("owner-1", "b1", "owner-1/b1/pdf/x.pdf", 12);
    expect(prisma.book.updateMany).toHaveBeenCalledWith({
      where: { id: "b1", ownerId: "owner-1" },
      data: { pdfKey: "owner-1/b1/pdf/x.pdf", pageCount: 12 },
    });
  });
});

describe("presignBookPdfView", () => {
  it("returns null when no PDF is attached", async () => {
    prisma.book.findFirst.mockResolvedValue({ pdfKey: null } as never);
    await expect(presignBookPdfView("owner-1", "b1")).resolves.toBeNull();
    expect(presignGet).not.toHaveBeenCalled();
  });
  it("signs a GET for the stored key", async () => {
    prisma.book.findFirst.mockResolvedValue({ pdfKey: "owner-1/b1/pdf/x.pdf" } as never);
    await expect(presignBookPdfView("owner-1", "b1")).resolves.toBe("https://signed/get");
    expect(presignGet).toHaveBeenCalledWith("owner-1/b1/pdf/x.pdf");
  });
});
