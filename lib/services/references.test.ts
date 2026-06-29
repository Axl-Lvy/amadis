import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import {
  createRef,
  deleteRef,
  listBacklinks,
  listRefsFor,
  resolveTarget,
} from "./references";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prisma;
  },
}));

beforeEach(() => {
  mockReset(prisma);
});

describe("createRef", () => {
  it("rejects an unknown target type", async () => {
    await expect(
      createRef("owner-1", { sourceId: "pl1", targetType: "BOOK", targetId: "x" }),
    ).rejects.toMatchObject({ code: "invalidTargetType" });
  });

  it("rejects when the source placement is not owned", async () => {
    prisma.placement.findFirst.mockResolvedValue(null as never);
    await expect(
      createRef("owner-1", { sourceId: "pl1", targetType: "PASSAGE", targetId: "p2" }),
    ).rejects.toMatchObject({ code: "refSourceNotFound" });
  });

  it("rejects when the target is not owned", async () => {
    prisma.placement.findFirst.mockResolvedValue({ id: "pl1" } as never); // source ok
    prisma.passage.findFirst.mockResolvedValue(null as never); // target missing
    await expect(
      createRef("owner-1", { sourceId: "pl1", targetType: "PASSAGE", targetId: "p2" }),
    ).rejects.toMatchObject({ code: "refTargetNotFound" });
  });

  it("creates an owner-scoped ref when source and target are owned", async () => {
    prisma.placement.findFirst.mockResolvedValue({ id: "pl1" } as never);
    prisma.passage.findFirst.mockResolvedValue({ id: "p2" } as never);
    prisma.placementRef.create.mockResolvedValue({ id: "r1" } as never);
    await createRef("owner-1", { sourceId: "pl1", targetType: "PASSAGE", targetId: "p2" });
    expect(prisma.placementRef.create).toHaveBeenCalledWith({
      data: { ownerId: "owner-1", sourceId: "pl1", targetType: "PASSAGE", targetId: "p2" },
    });
  });

  it("is idempotent: returns the existing ref without creating a duplicate", async () => {
    prisma.placement.findFirst.mockResolvedValue({ id: "pl1" } as never);
    prisma.passage.findFirst.mockResolvedValue({ id: "p2" } as never);
    prisma.placementRef.findFirst.mockResolvedValue({ id: "existing-ref" } as never);
    const ref = await createRef("owner-1", {
      sourceId: "pl1",
      targetType: "PASSAGE",
      targetId: "p2",
    });
    expect(ref).toMatchObject({ id: "existing-ref" });
    expect(prisma.placementRef.create).not.toHaveBeenCalled();
  });
});

describe("deleteRef", () => {
  it("deletes only the owner's ref", async () => {
    prisma.placementRef.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deleteRef("owner-1", "r1");
    expect(prisma.placementRef.deleteMany).toHaveBeenCalledWith({
      where: { id: "r1", ownerId: "owner-1" },
    });
  });
});

describe("resolveTarget", () => {
  it("builds a passage label and deep link", async () => {
    prisma.passage.findFirst.mockResolvedValue({
      id: "p2",
      bookId: "b1",
      number: 3,
      title: "Le Chevalier",
    } as never);
    const r = await resolveTarget("owner-1", "PASSAGE", "p2");
    expect(r).toMatchObject({
      exists: true,
      label: "#3 Le Chevalier",
      href: "/books/b1/passages/p2",
    });
  });

  it("resolves a placement span by code points", async () => {
    prisma.placement.findFirst.mockResolvedValue({
      id: "pl1",
      passageId: "p2",
      field: "TEXT",
      start: 0,
      end: 3,
    } as never);
    prisma.passage.findFirst.mockResolvedValue({
      bookId: "b1",
      title: "",
      text: "a😀bc",
    } as never);
    const r = await resolveTarget("owner-1", "PLACEMENT", "pl1");
    expect(r.label).toBe("a😀b");
    expect(r.href).toBe("/books/b1/passages/p2?placement=pl1");
  });

  it("marks a missing target as not existing instead of throwing", async () => {
    prisma.variant.findFirst.mockResolvedValue(null as never);
    const r = await resolveTarget("owner-1", "VARIANT", "gone");
    expect(r.exists).toBe(false);
  });

  it("builds a variant label and deep link via its passage's book", async () => {
    prisma.variant.findFirst.mockResolvedValue({
      id: "v1",
      passageId: "p2",
      label: "alt",
    } as never);
    prisma.passage.findFirst.mockResolvedValue({ bookId: "b1" } as never);
    const r = await resolveTarget("owner-1", "VARIANT", "v1");
    expect(r).toMatchObject({
      exists: true,
      label: "alt",
      href: "/books/b1/passages/p2?variant=v1",
    });
  });

  it("falls back to 'variant' and href '#' when the variant's passage is gone", async () => {
    prisma.variant.findFirst.mockResolvedValue({
      id: "v1",
      passageId: "p2",
      label: "",
    } as never);
    prisma.passage.findFirst.mockResolvedValue(null as never);
    const r = await resolveTarget("owner-1", "VARIANT", "v1");
    expect(r).toMatchObject({ exists: false, label: "variant", href: "#" });
  });

  it("returns exists:false when the placement target itself is missing", async () => {
    prisma.placement.findFirst.mockResolvedValue(null as never);
    const r = await resolveTarget("owner-1", "PLACEMENT", "gone");
    expect(r).toMatchObject({ exists: false, label: "", href: "#" });
  });

  it("returns exists:false when a placement's passage is gone", async () => {
    prisma.placement.findFirst.mockResolvedValue({
      id: "pl1",
      passageId: "p2",
      field: "TEXT",
      start: 0,
      end: 1,
    } as never);
    prisma.passage.findFirst.mockResolvedValue(null as never);
    const r = await resolveTarget("owner-1", "PLACEMENT", "pl1");
    expect(r.exists).toBe(false);
  });
});

describe("listRefsFor", () => {
  it("lists the source's refs and resolves each for display", async () => {
    prisma.placementRef.findMany.mockResolvedValue([
      { id: "r1", targetType: "PASSAGE", targetId: "p2" },
    ] as never);
    prisma.passage.findFirst.mockResolvedValue({
      id: "p2",
      bookId: "b1",
      number: 3,
      title: "Le Chevalier",
    } as never);

    const out = await listRefsFor("owner-1", "pl1");
    expect(prisma.placementRef.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", sourceId: "pl1" },
      orderBy: { createdAt: "asc" },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      id: "r1",
      targetType: "PASSAGE",
      targetId: "p2",
      resolved: { exists: true, label: "#3 Le Chevalier", href: "/books/b1/passages/p2" },
    });
  });
});

describe("listBacklinks", () => {
  it("lists placement refs pointing at a target, owner-scoped", async () => {
    prisma.placementRef.findMany.mockResolvedValue([{ id: "r1" }] as never);
    const out = await listBacklinks("owner-1", "p2");
    expect(prisma.placementRef.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1", targetId: "p2" },
      orderBy: { createdAt: "asc" },
    });
    expect(out).toHaveLength(1);
  });
});
