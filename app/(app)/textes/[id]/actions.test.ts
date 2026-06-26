import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import {
  attachScan,
  createAnnotation,
  createTag,
  deleteAnnotation,
  presignScanUpload,
  presignScanView,
} from "./actions";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
const getSignedUrl = vi.fn();

vi.mock("@/lib/prisma", () => ({ get prisma() { return prisma; } }));
vi.mock("@/lib/session", () => ({ requireUserId: () => Promise.resolve("owner-1") }));
vi.mock("@/lib/r2", () => ({ r2: {}, R2_BUCKET: "test-bucket" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrl(...args),
}));
// Capture the command inputs without depending on the real SDK behaviour.
vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  GetObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));
vi.mock("next-intl/server", async () => {
  const en = (await import("@/messages/en.json")).default as Record<string, unknown>;
  const get = (obj: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
  return {
    getTranslations: async (ns: string) => (key: string) => get(en, `${ns}.${key}`) as string,
  };
});

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  mockReset(prisma);
  getSignedUrl.mockReset();
});

describe("createTag", () => {
  it("upserts per-user on (layer, code)", async () => {
    prisma.tag.upsert.mockResolvedValue({} as never);
    await createTag(form({ layer: "pos", code: "NOUN", label: "Noun", texteId: "t1" }));
    expect(prisma.tag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId_layer_code: { ownerId: "owner-1", layer: "pos", code: "NOUN" } },
        create: { ownerId: "owner-1", layer: "pos", code: "NOUN", label: "Noun" },
      }),
    );
  });

  it("requires layer and code", async () => {
    await expect(createTag(form({ layer: "", code: "X" }))).rejects.toThrow(
      "Layer and code are required",
    );
    expect(prisma.tag.upsert).not.toHaveBeenCalled();
  });
});

describe("createAnnotation", () => {
  function ownedTexte(content: string) {
    prisma.texte.findFirst.mockResolvedValue({ id: "t1", content } as never);
  }

  it("creates an owner-scoped annotation for a valid span", async () => {
    ownedTexte("abcdef");
    prisma.tag.findFirst.mockResolvedValue({ id: "tag1" } as never);
    prisma.annotation.create.mockResolvedValue({} as never);

    await createAnnotation(
      form({ texteId: "t1", tagId: "tag1", start: "1", end: "4", note: "n" }),
    );

    expect(prisma.annotation.create).toHaveBeenCalledWith({
      data: { ownerId: "owner-1", texteId: "t1", tagId: "tag1", start: 1, end: 4, note: "n" },
    });
    // Tag ownership is verified against the same owner (no cross-user reference).
    expect(prisma.tag.findFirst).toHaveBeenCalledWith({
      where: { id: "tag1", ownerId: "owner-1" },
      select: { id: true },
    });
  });

  it("validates the span against code-point length, not UTF-16 length", async () => {
    // "a😀b" is 3 code points but 4 UTF-16 units. end=3 must be valid.
    ownedTexte("a😀b");
    prisma.tag.findFirst.mockResolvedValue({ id: "tag1" } as never);
    prisma.annotation.create.mockResolvedValue({} as never);

    await createAnnotation(form({ texteId: "t1", tagId: "tag1", start: "0", end: "3" }));
    expect(prisma.annotation.create).toHaveBeenCalled();
  });

  it("rejects an out-of-range span", async () => {
    ownedTexte("abc");
    await expect(
      createAnnotation(form({ texteId: "t1", tagId: "tag1", start: "0", end: "99" })),
    ).rejects.toThrow("Invalid span");
    expect(prisma.annotation.create).not.toHaveBeenCalled();
  });

  it("rejects a collapsed span (start >= end)", async () => {
    ownedTexte("abc");
    await expect(
      createAnnotation(form({ texteId: "t1", tagId: "tag1", start: "2", end: "2" })),
    ).rejects.toThrow("Invalid span");
  });

  it("throws when the texte is not owned by the caller", async () => {
    prisma.texte.findFirst.mockResolvedValue(null as never);
    await expect(
      createAnnotation(form({ texteId: "t1", tagId: "tag1", start: "0", end: "1" })),
    ).rejects.toThrow("Texte not found");
  });

  it("throws when the tag is not owned by the caller", async () => {
    ownedTexte("abcdef");
    prisma.tag.findFirst.mockResolvedValue(null as never);
    await expect(
      createAnnotation(form({ texteId: "t1", tagId: "tag1", start: "0", end: "1" })),
    ).rejects.toThrow("Tag not found");
  });
});

describe("deleteAnnotation", () => {
  it("deletes only the caller's annotation", async () => {
    prisma.annotation.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deleteAnnotation(form({ id: "a1", texteId: "t1" }));
    expect(prisma.annotation.deleteMany).toHaveBeenCalledWith({
      where: { id: "a1", ownerId: "owner-1" },
    });
  });
});

describe("presignScanUpload", () => {
  it("namespaces the key by owner and texte and signs a PUT", async () => {
    prisma.texte.findFirst.mockResolvedValue({ id: "t1", content: "" } as never);
    getSignedUrl.mockResolvedValue("https://signed.example/put");

    const { url, key } = await presignScanUpload("t1", "my scan!.png", "image/png");

    expect(url).toBe("https://signed.example/put");
    expect(key).toMatch(/^owner-1\/t1\/.*my_scan_\.png$/);
    const command = getSignedUrl.mock.calls[0][1] as { input: Record<string, unknown> };
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Key).toBe(key);
  });

  it("rejects when the texte is not owned by the caller", async () => {
    prisma.texte.findFirst.mockResolvedValue(null as never);
    await expect(presignScanUpload("t1", "x.png", "image/png")).rejects.toThrow(
      "Texte not found",
    );
  });
});

describe("attachScan", () => {
  it("rejects a key outside the caller's namespace", async () => {
    await expect(attachScan("t1", "other-owner/t1/file.png")).rejects.toThrow(
      "Invalid scan key",
    );
    expect(prisma.texte.updateMany).not.toHaveBeenCalled();
  });

  it("stores an owner-scoped key", async () => {
    prisma.texte.updateMany.mockResolvedValue({ count: 1 } as never);
    await attachScan("t1", "owner-1/t1/file.png");
    expect(prisma.texte.updateMany).toHaveBeenCalledWith({
      where: { id: "t1", ownerId: "owner-1" },
      data: { scanKey: "owner-1/t1/file.png" },
    });
  });
});

describe("presignScanView", () => {
  it("returns null when there is no scan", async () => {
    prisma.texte.findFirst.mockResolvedValue({ scanKey: null } as never);
    await expect(presignScanView("t1")).resolves.toBeNull();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("signs a GET for the stored key", async () => {
    prisma.texte.findFirst.mockResolvedValue({ scanKey: "owner-1/t1/file.png" } as never);
    getSignedUrl.mockResolvedValue("https://signed.example/get");
    await expect(presignScanView("t1")).resolves.toBe("https://signed.example/get");
    const command = getSignedUrl.mock.calls[0][1] as { input: Record<string, unknown> };
    expect(command.input.Key).toBe("owner-1/t1/file.png");
  });
});
