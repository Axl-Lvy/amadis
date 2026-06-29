import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/services/errors";
import type { TagNode } from "@/lib/tag-tree";

import {
  createChildTagForm,
  createRootTagForm,
  createTag,
  deleteTag,
  deleteTagForm,
  renameTag,
  renameTagForm,
  searchChildren,
  searchRootTags,
  searchRootTypes,
} from "./actions";

// Wrappers over the tags service. Search actions pass through (read-only); the
// mutations return a result object (translated via getTranslations, mocked to
// echo the key) or, for the plain <form> variants, return void. errors.ts is
// real so the {ok:false,error} branch can run.
vi.mock("@/lib/services/tags", () => ({
  searchRootTypes: vi.fn(),
  searchRootTags: vi.fn(),
  searchChildren: vi.fn(),
  createTag: vi.fn(),
  renameTag: vi.fn(),
  deleteTag: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  requireUserId: () => Promise.resolve("owner-1"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string) => k,
}));

import {
  createTag as createTagSvc,
  deleteTag as deleteTagSvc,
  renameTag as renameTagSvc,
  searchChildren as searchChildrenSvc,
  searchRootTags as searchRootTagsSvc,
  searchRootTypes as searchRootTypesSvc,
} from "@/lib/services/tags";
import { revalidatePath } from "next/cache";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const node: TagNode = { id: "t1", parentId: null, type: "POS", name: "Noun" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("search passthroughs", () => {
  it("searchRootTypes scopes to the owner and returns the list", async () => {
    vi.mocked(searchRootTypesSvc).mockResolvedValue(["POS", "CASE"]);
    const res = await searchRootTypes("p");
    expect(searchRootTypesSvc).toHaveBeenCalledWith("owner-1", "p");
    expect(res).toEqual(["POS", "CASE"]);
  });

  it("searchRootTags scopes to the owner and returns nodes", async () => {
    vi.mocked(searchRootTagsSvc).mockResolvedValue([node]);
    const res = await searchRootTags("POS", "no");
    expect(searchRootTagsSvc).toHaveBeenCalledWith("owner-1", "POS", "no");
    expect(res).toEqual([node]);
  });

  it("searchChildren scopes to the owner and returns nodes", async () => {
    vi.mocked(searchChildrenSvc).mockResolvedValue([node]);
    const res = await searchChildren("parent-1", "q");
    expect(searchChildrenSvc).toHaveBeenCalledWith("owner-1", "parent-1", "q");
    expect(res).toEqual([node]);
  });
});

describe("createTag", () => {
  it("creates the node for the owner, revalidates and returns it", async () => {
    vi.mocked(createTagSvc).mockResolvedValue(node);
    const input = { parentId: null, type: "POS", name: "Noun" };
    const res = await createTag(input);
    expect(createTagSvc).toHaveBeenCalledWith("owner-1", input);
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
    expect(res).toEqual({ ok: true, tag: node });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(createTagSvc).mockRejectedValue(new ServiceError("tagNameRequired"));
    const res = await createTag({ name: "" });
    expect(res).toEqual({ ok: false, error: "tagNameRequired" });
  });

  it("rethrows a non-ServiceError", async () => {
    vi.mocked(createTagSvc).mockRejectedValue(new Error("boom"));
    await expect(createTag({ name: "x" })).rejects.toThrow("boom");
  });
});

describe("renameTag", () => {
  it("renames the owner's node and revalidates", async () => {
    vi.mocked(renameTagSvc).mockResolvedValue(undefined as never);
    const res = await renameTag("t1", "Verb");
    expect(renameTagSvc).toHaveBeenCalledWith("owner-1", "t1", "Verb");
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(renameTagSvc).mockRejectedValue(new ServiceError("tagNotFound"));
    const res = await renameTag("t1", "Verb");
    expect(res).toEqual({ ok: false, error: "tagNotFound" });
  });
});

describe("deleteTag", () => {
  it("deletes the owner's node and revalidates", async () => {
    vi.mocked(deleteTagSvc).mockResolvedValue(undefined as never);
    const res = await deleteTag("t1");
    expect(deleteTagSvc).toHaveBeenCalledWith("owner-1", "t1");
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(deleteTagSvc).mockRejectedValue(new ServiceError("tagNotFound"));
    const res = await deleteTag("t1");
    expect(res).toEqual({ ok: false, error: "tagNotFound" });
  });
});

describe("plain <form> actions", () => {
  it("createRootTagForm creates a trimmed root tag for the owner", async () => {
    vi.mocked(createTagSvc).mockResolvedValue(node);
    await createRootTagForm(form({ type: "  POS ", name: "  Noun " }));
    expect(createTagSvc).toHaveBeenCalledWith("owner-1", {
      parentId: null,
      type: "POS",
      name: "Noun",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
  });

  it("createChildTagForm creates a child under the parent for the owner", async () => {
    vi.mocked(createTagSvc).mockResolvedValue(node);
    await createChildTagForm(form({ parentId: "parent-1", name: "  Child " }));
    expect(createTagSvc).toHaveBeenCalledWith("owner-1", {
      parentId: "parent-1",
      name: "Child",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
  });

  it("renameTagForm renames the owner's node", async () => {
    vi.mocked(renameTagSvc).mockResolvedValue(undefined as never);
    await renameTagForm(form({ id: "t1", name: "Verb" }));
    expect(renameTagSvc).toHaveBeenCalledWith("owner-1", "t1", "Verb");
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
  });

  it("deleteTagForm deletes the owner's node", async () => {
    vi.mocked(deleteTagSvc).mockResolvedValue(undefined as never);
    await deleteTagForm(form({ id: "t1" }));
    expect(deleteTagSvc).toHaveBeenCalledWith("owner-1", "t1");
    expect(revalidatePath).toHaveBeenCalledWith("/tags");
  });
});
