import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBookAction,
  deleteBookAction,
  updateBookAction,
} from "./actions";

// The actions are thin wrappers over the books service. Mock the service so we
// can assert wiring + owner-scoping (the owner id always comes from the
// session, never the client) and that the cache/redirect side effects fire.
vi.mock("@/lib/services/books", () => ({
  createBook: vi.fn(),
  deleteBook: vi.fn(),
  updateBook: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  requireUserId: () => Promise.resolve("owner-1"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { createBook, deleteBook, updateBook } from "@/lib/services/books";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createBookAction", () => {
  it("creates the book for the session owner then revalidates and redirects", async () => {
    vi.mocked(createBook).mockResolvedValue({ id: "b1" } as never);
    await createBookAction(form({ title: "Roland", author: "Turold" }));
    expect(createBook).toHaveBeenCalledWith("owner-1", {
      title: "Roland",
      author: "Turold",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/books");
    expect(redirect).toHaveBeenCalledWith("/books/b1");
  });

  it("normalizes a blank author to null", async () => {
    vi.mocked(createBook).mockResolvedValue({ id: "b2" } as never);
    await createBookAction(form({ title: "Tristan", author: "" }));
    expect(createBook).toHaveBeenCalledWith("owner-1", {
      title: "Tristan",
      author: null,
    });
  });
});

describe("deleteBookAction", () => {
  it("deletes the owner's book and revalidates the list", async () => {
    vi.mocked(deleteBook).mockResolvedValue(undefined as never);
    await deleteBookAction(form({ id: "b1" }));
    expect(deleteBook).toHaveBeenCalledWith("owner-1", "b1");
    expect(revalidatePath).toHaveBeenCalledWith("/books");
  });
});

describe("updateBookAction", () => {
  it("updates the owner's book and revalidates list + detail", async () => {
    vi.mocked(updateBook).mockResolvedValue(undefined as never);
    await updateBookAction(form({ id: "b1", title: "New", author: "Anon" }));
    expect(updateBook).toHaveBeenCalledWith("owner-1", "b1", {
      title: "New",
      author: "Anon",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/books");
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1");
  });

  it("normalizes a blank author to null", async () => {
    vi.mocked(updateBook).mockResolvedValue(undefined as never);
    await updateBookAction(form({ id: "b1", title: "New", author: "" }));
    expect(updateBook).toHaveBeenCalledWith("owner-1", "b1", {
      title: "New",
      author: null,
    });
  });
});
