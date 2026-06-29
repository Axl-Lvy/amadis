import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { presignPut } from "@/lib/r2";

import {
  attachVariantScan,
  createVariant,
  deleteVariant,
  presignVariantScanUpload,
  updateVariant,
} from "./variants";

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

describe("createVariant", () => {
  it("rejects when the passage is not owned", async () => {
    prisma.passage.findFirst.mockResolvedValue(null as never);
    await expect(createVariant("owner-1", { passageId: "p1" })).rejects.toMatchObject({
      code: "passageNotFound",
    });
    expect(prisma.variant.create).not.toHaveBeenCalled();
  });
  it("NFC-normalizes text and stamps ownerId", async () => {
    prisma.passage.findFirst.mockResolvedValue({ id: "p1" } as never);
    prisma.variant.create.mockResolvedValue({ id: "v1" } as never);
    await createVariant("owner-1", { passageId: "p1", label: " A ", text: "é" });
    expect(prisma.variant.create).toHaveBeenCalledWith({
      data: { ownerId: "owner-1", passageId: "p1", label: "A", text: "é" },
    });
  });
});

describe("updateVariant / deleteVariant", () => {
  it("updates only the owner's variant", async () => {
    prisma.variant.updateMany.mockResolvedValue({ count: 1 } as never);
    await updateVariant("owner-1", "v1", { label: "B", text: "x" });
    expect(prisma.variant.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", ownerId: "owner-1" },
      data: { label: "B", text: "x" },
    });
  });
  it("throws when deleting a variant that is not owned", async () => {
    prisma.variant.deleteMany.mockResolvedValue({ count: 0 } as never);
    await expect(deleteVariant("owner-1", "v1")).rejects.toMatchObject({
      code: "variantNotFound",
    });
  });
});

describe("presignVariantScanUpload", () => {
  it("namespaces the key by owner + passage + variant", async () => {
    prisma.variant.findFirst.mockResolvedValue({
      id: "v1",
      passageId: "p1",
      ownerId: "owner-1",
    } as never);
    const { key } = await presignVariantScanUpload("owner-1", "v1", "scan!.png", "image/png");
    expect(key).toMatch(/^owner-1\/p1\/variant\/v1\/.*scan_\.png$/);
    expect(presignPut).toHaveBeenCalledWith(key, "image/png");
  });
});

describe("attachVariantScan", () => {
  it("rejects a key outside the variant's namespace", async () => {
    prisma.variant.findFirst.mockResolvedValue({
      id: "v1",
      passageId: "p1",
      ownerId: "owner-1",
    } as never);
    await expect(attachVariantScan("owner-1", "v1", "owner-1/p9/variant/v1/x.png")).rejects.toMatchObject(
      { code: "invalidScanKey" },
    );
    expect(prisma.variant.updateMany).not.toHaveBeenCalled();
  });
  it("stores an owner-scoped key", async () => {
    prisma.variant.findFirst.mockResolvedValue({
      id: "v1",
      passageId: "p1",
      ownerId: "owner-1",
    } as never);
    prisma.variant.updateMany.mockResolvedValue({ count: 1 } as never);
    await attachVariantScan("owner-1", "v1", "owner-1/p1/variant/v1/x.png");
    expect(prisma.variant.updateMany).toHaveBeenCalledWith({
      where: { id: "v1", ownerId: "owner-1" },
      data: { scanKey: "owner-1/p1/variant/v1/x.png" },
    });
  });

  it("throws when the variant row vanished between check and update", async () => {
    prisma.variant.findFirst.mockResolvedValue({
      id: "v1",
      passageId: "p1",
      ownerId: "owner-1",
    } as never);
    prisma.variant.updateMany.mockResolvedValue({ count: 0 } as never);
    await expect(
      attachVariantScan("owner-1", "v1", "owner-1/p1/variant/v1/x.png"),
    ).rejects.toMatchObject({ code: "variantNotFound" });
  });
});
