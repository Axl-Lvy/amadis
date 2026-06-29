import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/services/errors";

import {
  addMarkAction,
  attachBookPdfAction,
  createPassageAction,
  deletePassageAction,
  moveMarkAction,
  presignBookPdfUploadAction,
  removeMarkAction,
  reorderPassagesAction,
  reorderPassagesFormAction,
  updateBookAction,
  updatePassageAction,
} from "./actions";

// Thin wrappers over the books + passages services. Mock both services; the
// real ServiceError is used (errors.ts is NOT mocked) so the {ok:false,error}
// branch can be exercised, and getTranslations is mocked to echo the key so the
// translated error equals the ServiceError code.
vi.mock("@/lib/services/books", () => ({
  updateBook: vi.fn(),
  presignBookPdfUpload: vi.fn(),
  attachBookPdf: vi.fn(),
}));
vi.mock("@/lib/services/passages", () => ({
  createPassage: vi.fn(),
  deletePassage: vi.fn(),
  updatePassage: vi.fn(),
  reorderPassages: vi.fn(),
}));
vi.mock("@/lib/services/marks", () => ({
  createMark: vi.fn(),
  updateMark: vi.fn(),
  deleteMark: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  requireUserId: () => Promise.resolve("owner-1"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string) => k,
}));

import {
  attachBookPdf,
  presignBookPdfUpload,
  updateBook,
} from "@/lib/services/books";
import {
  createPassage,
  deletePassage,
  reorderPassages,
  updatePassage,
} from "@/lib/services/passages";
import { createMark, deleteMark, updateMark } from "@/lib/services/marks";
import { revalidatePath } from "next/cache";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateBookAction", () => {
  it("updates the owner's book and returns ok", async () => {
    vi.mocked(updateBook).mockResolvedValue(undefined as never);
    const res = await updateBookAction("b1", { title: "T", author: "A" });
    expect(updateBook).toHaveBeenCalledWith("owner-1", "b1", { title: "T", author: "A" });
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1");
    expect(revalidatePath).toHaveBeenCalledWith("/books");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError into {ok:false,error}", async () => {
    vi.mocked(updateBook).mockRejectedValue(new ServiceError("bookTitleRequired"));
    const res = await updateBookAction("b1", { title: " " });
    expect(res).toEqual({ ok: false, error: "bookTitleRequired" });
  });

  it("rethrows a non-ServiceError", async () => {
    vi.mocked(updateBook).mockRejectedValue(new Error("boom"));
    await expect(updateBookAction("b1", { title: "T" })).rejects.toThrow("boom");
  });
});

describe("createPassageAction", () => {
  it("passes a parsed number when provided", async () => {
    vi.mocked(createPassage).mockResolvedValue({ id: "p1" } as never);
    await createPassageAction(form({ bookId: "b1", number: "7", title: "T", text: "txt" }));
    expect(createPassage).toHaveBeenCalledWith("owner-1", {
      bookId: "b1",
      number: 7,
      title: "T",
      text: "txt",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1");
  });

  it("auto-assigns the number (undefined) when the field is blank", async () => {
    vi.mocked(createPassage).mockResolvedValue({ id: "p2" } as never);
    await createPassageAction(form({ bookId: "b1", number: "  ", title: "", text: "" }));
    expect(createPassage).toHaveBeenCalledWith("owner-1", {
      bookId: "b1",
      number: undefined,
      title: "",
      text: "",
    });
  });
});

describe("deletePassageAction", () => {
  it("deletes the owner's passage and revalidates the book page", async () => {
    vi.mocked(deletePassage).mockResolvedValue(undefined as never);
    await deletePassageAction(form({ id: "p1", bookId: "b1" }));
    expect(deletePassage).toHaveBeenCalledWith("owner-1", "p1");
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1");
  });
});

describe("updatePassageAction", () => {
  it("updates and revalidates both book + passage pages", async () => {
    vi.mocked(updatePassage).mockResolvedValue(undefined as never);
    const res = await updatePassageAction("p1", "b1", { number: 2, title: "x" });
    expect(updatePassage).toHaveBeenCalledWith("owner-1", "p1", { number: 2, title: "x" });
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1");
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });

  it("returns {ok:false,error} on a ServiceError", async () => {
    vi.mocked(updatePassage).mockRejectedValue(new ServiceError("passageNotFound"));
    const res = await updatePassageAction("p1", "b1", { title: "x" });
    expect(res).toEqual({ ok: false, error: "passageNotFound" });
  });
});

describe("reorderPassagesAction", () => {
  it("reorders for the owner and revalidates", async () => {
    vi.mocked(reorderPassages).mockResolvedValue(undefined as never);
    const res = await reorderPassagesAction("b1", ["p2", "p1"]);
    expect(reorderPassages).toHaveBeenCalledWith("owner-1", "b1", ["p2", "p1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(reorderPassages).mockRejectedValue(new ServiceError("passageNotFound"));
    const res = await reorderPassagesAction("b1", ["p1"]);
    expect(res).toEqual({ ok: false, error: "passageNotFound" });
  });
});

describe("reorderPassagesFormAction", () => {
  it("delegates to the reorder service (returns void)", async () => {
    vi.mocked(reorderPassages).mockResolvedValue(undefined as never);
    const res = await reorderPassagesFormAction("b1", ["p1", "p2"]);
    expect(reorderPassages).toHaveBeenCalledWith("owner-1", "b1", ["p1", "p2"]);
    expect(res).toBeUndefined();
  });
});

describe("mark actions", () => {
  it("addMarkAction returns the new id on success", async () => {
    vi.mocked(createMark).mockResolvedValue({ id: "m1" } as never);
    const res = await addMarkAction("b1", 2, 0.5);
    expect(res).toEqual({ ok: true, id: "m1" });
    expect(createMark).toHaveBeenCalledWith("owner-1", { bookId: "b1", page: 2, frac: 0.5 });
  });

  it("moveMarkAction translates a ServiceError code", async () => {
    vi.mocked(updateMark).mockRejectedValue(new ServiceError("markNotFound"));
    const res = await moveMarkAction("m1", "b1", 1, 0.5);
    expect(res.ok).toBe(false);
  });

  it("removeMarkAction succeeds", async () => {
    vi.mocked(deleteMark).mockResolvedValue(undefined as never);
    const res = await removeMarkAction("m1", "b1");
    expect(res).toEqual({ ok: true });
  });
});

describe("presignBookPdfUploadAction", () => {
  it("returns the signed url + key from the service", async () => {
    vi.mocked(presignBookPdfUpload).mockResolvedValue({
      url: "https://signed/put",
      key: "owner-1/b1/pdf/x.pdf",
    } as never);
    const res = await presignBookPdfUploadAction("b1", "x.pdf");
    expect(presignBookPdfUpload).toHaveBeenCalledWith("owner-1", "b1", "x.pdf");
    expect(res).toEqual({ ok: true, url: "https://signed/put", key: "owner-1/b1/pdf/x.pdf" });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(presignBookPdfUpload).mockRejectedValue(new ServiceError("bookNotFound"));
    const res = await presignBookPdfUploadAction("b1", "x.pdf");
    expect(res).toEqual({ ok: false, error: "bookNotFound" });
  });
});

describe("attachBookPdfAction", () => {
  it("records the key + page count for the owner and revalidates", async () => {
    vi.mocked(attachBookPdf).mockResolvedValue(undefined as never);
    const res = await attachBookPdfAction("b1", "owner-1/b1/pdf/x.pdf", 12);
    expect(attachBookPdf).toHaveBeenCalledWith("owner-1", "b1", "owner-1/b1/pdf/x.pdf", 12);
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(attachBookPdf).mockRejectedValue(new ServiceError("invalidPdfKey"));
    const res = await attachBookPdfAction("b1", "other/b1/pdf/x.pdf", 1);
    expect(res).toEqual({ ok: false, error: "invalidPdfKey" });
  });
});
