import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import {
  createTag,
  deleteTag,
  getTagPath,
  rankByQuery,
  renameTag,
  searchChildren,
  searchRootTypes,
  tagPath,
  type TagNode,
} from "./tags";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prisma;
  },
}));

beforeEach(() => {
  mockReset(prisma);
});

describe("rankByQuery", () => {
  it("ranks prefix matches before substring matches, then alphabetically", () => {
    const items = ["verb", "adverb", "adjective", "noun"];
    expect(rankByQuery(items, (s) => s, "verb")).toEqual(["verb", "adverb"]);
  });
  it("keeps everything alphabetically for an empty query", () => {
    expect(rankByQuery(["b", "a", "c"], (s) => s, "")).toEqual(["a", "b", "c"]);
  });
});

describe("searchRootTypes", () => {
  it("queries owner roots with a type and ranks them", async () => {
    prisma.tag.findMany.mockResolvedValue([{ type: "morphology" }, { type: "pos" }] as never);
    const out = await searchRootTypes("owner-1", "p");
    expect(prisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: "owner-1", parentId: null, type: { not: null } },
        distinct: ["type"],
      }),
    );
    // "pos" is a prefix match (rank 0); "morphology" contains "p" (rank 1).
    expect(out).toEqual(["pos", "morphology"]);
  });
});

describe("searchChildren", () => {
  it("rejects when the parent is not owned", async () => {
    prisma.tag.findFirst.mockResolvedValue(null as never);
    await expect(searchChildren("owner-1", "parent", "")).rejects.toMatchObject({
      code: "tagNotFound",
    });
  });
});

describe("createTag", () => {
  it("requires a name", async () => {
    await expect(createTag("owner-1", { name: "  " })).rejects.toMatchObject({
      code: "tagNameRequired",
    });
  });

  it("requires a type for a root tag", async () => {
    await expect(createTag("owner-1", { name: "Noun", parentId: null })).rejects.toMatchObject({
      code: "tagTypeRequired",
    });
  });

  it("rejects a sub-tag under a parent the caller does not own", async () => {
    prisma.tag.findFirst.mockResolvedValue(null as never);
    await expect(
      createTag("owner-1", { name: "child", parentId: "p-foreign" }),
    ).rejects.toMatchObject({ code: "tagParentInvalid" });
  });

  it("reuses an existing node (find-or-create) without creating a duplicate", async () => {
    prisma.tag.findFirst.mockResolvedValue({
      id: "root-1",
      parentId: null,
      type: "pos",
      name: "Noun",
    } as never);
    const node = await createTag("owner-1", { name: "Noun", type: "pos", parentId: null });
    expect(node.id).toBe("root-1");
    expect(prisma.tag.create).not.toHaveBeenCalled();
  });

  it("creates a new owner-scoped root tag when none exists", async () => {
    prisma.tag.findFirst.mockResolvedValue(null as never);
    prisma.tag.create.mockResolvedValue({
      id: "root-2",
      parentId: null,
      type: "pos",
      name: "Verb",
    } as never);
    await createTag("owner-1", { name: " Verb ", type: " pos ", parentId: null });
    expect(prisma.tag.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ownerId: "owner-1", parentId: null, type: "pos", name: "Verb" },
      }),
    );
  });
});

describe("renameTag / deleteTag", () => {
  it("renames only the owner's tag", async () => {
    prisma.tag.updateMany.mockResolvedValue({ count: 1 } as never);
    await renameTag("owner-1", "t1", " New ");
    expect(prisma.tag.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", ownerId: "owner-1" },
      data: { name: "New" },
    });
  });
  it("deletes only the owner's tag (cascading children)", async () => {
    prisma.tag.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deleteTag("owner-1", "t1");
    expect(prisma.tag.deleteMany).toHaveBeenCalledWith({ where: { id: "t1", ownerId: "owner-1" } });
  });
  it("throws when the tag is not owned", async () => {
    prisma.tag.deleteMany.mockResolvedValue({ count: 0 } as never);
    await expect(deleteTag("owner-1", "t1")).rejects.toMatchObject({ code: "tagNotFound" });
  });
});

describe("getTagPath", () => {
  it("walks parentId from node up to root, owner-scoped", async () => {
    prisma.tag.findFirst
      .mockResolvedValueOnce({ id: "c", parentId: "b", type: null, name: "leaf" } as never)
      .mockResolvedValueOnce({ id: "b", parentId: "a", type: null, name: "mid" } as never)
      .mockResolvedValueOnce({ id: "a", parentId: null, type: "pos", name: "root" } as never);
    const path = await getTagPath("owner-1", "c");
    expect(path.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(prisma.tag.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c", ownerId: "owner-1" } }),
    );
  });
});

describe("tagPath (pure)", () => {
  it("builds a root->node path from an in-memory map", () => {
    const nodes: TagNode[] = [
      { id: "a", parentId: null, type: "pos", name: "root" },
      { id: "b", parentId: "a", type: null, name: "mid" },
      { id: "c", parentId: "b", type: null, name: "leaf" },
    ];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(tagPath(byId, "c").map((n) => n.name)).toEqual(["root", "mid", "leaf"]);
  });
});
