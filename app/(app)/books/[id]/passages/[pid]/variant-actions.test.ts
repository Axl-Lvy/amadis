import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/services/errors";

import {
  attachVariantScan,
  createVariant,
  deleteVariant,
  presignVariantScanUpload,
  presignVariantScanView,
  updateVariant,
} from "./variant-actions";

// Wrappers over the variants service (imported as a namespace in the action).
// Mock that module; errors.ts stays real and getTranslations echoes the key so
// the {ok:false,error} branch yields the ServiceError code as the message.
vi.mock("@/lib/services/variants", () => ({
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  deleteVariant: vi.fn(),
  presignVariantScanUpload: vi.fn(),
  attachVariantScan: vi.fn(),
  presignVariantScanView: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  requireUserId: () => Promise.resolve("owner-1"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string) => k,
}));

import * as variants from "@/lib/services/variants";
import { revalidatePath } from "next/cache";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createVariant", () => {
  it("creates a variant for the owner from FormData and revalidates", async () => {
    vi.mocked(variants.createVariant).mockResolvedValue(undefined as never);
    const res = await createVariant(
      form({ bookId: "b1", passageId: "p1", label: "L", text: "txt" }),
    );
    expect(variants.createVariant).toHaveBeenCalledWith("owner-1", {
      passageId: "p1",
      label: "L",
      text: "txt",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(variants.createVariant).mockRejectedValue(new ServiceError("passageNotFound"));
    const res = await createVariant(form({ bookId: "b1", passageId: "p1", label: "", text: "" }));
    expect(res).toEqual({ ok: false, error: "passageNotFound" });
  });

  it("rethrows a non-ServiceError", async () => {
    vi.mocked(variants.createVariant).mockRejectedValue(new Error("boom"));
    await expect(
      createVariant(form({ bookId: "b1", passageId: "p1", label: "L", text: "t" })),
    ).rejects.toThrow("boom");
  });
});

describe("updateVariant", () => {
  it("updates the owner's variant from FormData and revalidates", async () => {
    vi.mocked(variants.updateVariant).mockResolvedValue(undefined as never);
    const res = await updateVariant(
      form({ bookId: "b1", passageId: "p1", id: "v1", label: "L2", text: "txt2" }),
    );
    expect(variants.updateVariant).toHaveBeenCalledWith("owner-1", "v1", {
      label: "L2",
      text: "txt2",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(variants.updateVariant).mockRejectedValue(new ServiceError("variantNotFound"));
    const res = await updateVariant(
      form({ bookId: "b1", passageId: "p1", id: "v1", label: "L", text: "t" }),
    );
    expect(res).toEqual({ ok: false, error: "variantNotFound" });
  });
});

describe("deleteVariant", () => {
  it("deletes the owner's variant from FormData and revalidates", async () => {
    vi.mocked(variants.deleteVariant).mockResolvedValue(undefined as never);
    const res = await deleteVariant(form({ bookId: "b1", passageId: "p1", id: "v1" }));
    expect(variants.deleteVariant).toHaveBeenCalledWith("owner-1", "v1");
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(variants.deleteVariant).mockRejectedValue(new ServiceError("variantNotFound"));
    const res = await deleteVariant(form({ bookId: "b1", passageId: "p1", id: "v1" }));
    expect(res).toEqual({ ok: false, error: "variantNotFound" });
  });
});

describe("presignVariantScanUpload", () => {
  it("returns the signed url + key from the service", async () => {
    vi.mocked(variants.presignVariantScanUpload).mockResolvedValue({
      url: "https://signed/put",
      key: "owner-1/p1/v1/scan/x.png",
    } as never);
    const res = await presignVariantScanUpload("v1", "x.png", "image/png");
    expect(variants.presignVariantScanUpload).toHaveBeenCalledWith(
      "owner-1",
      "v1",
      "x.png",
      "image/png",
    );
    expect(res).toEqual({ ok: true, url: "https://signed/put", key: "owner-1/p1/v1/scan/x.png" });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(variants.presignVariantScanUpload).mockRejectedValue(
      new ServiceError("variantNotFound"),
    );
    const res = await presignVariantScanUpload("v1", "x.png", "image/png");
    expect(res).toEqual({ ok: false, error: "variantNotFound" });
  });
});

describe("attachVariantScan", () => {
  it("records the scan key for the owner and revalidates", async () => {
    vi.mocked(variants.attachVariantScan).mockResolvedValue(undefined as never);
    const res = await attachVariantScan("b1", "p1", "v1", "owner-1/p1/v1/scan/x.png");
    expect(variants.attachVariantScan).toHaveBeenCalledWith(
      "owner-1",
      "v1",
      "owner-1/p1/v1/scan/x.png",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(variants.attachVariantScan).mockRejectedValue(new ServiceError("invalidScanKey"));
    const res = await attachVariantScan("b1", "p1", "v1", "other/x.png");
    expect(res).toEqual({ ok: false, error: "invalidScanKey" });
  });
});

describe("presignVariantScanView", () => {
  it("returns the signed GET url (or null) for the owner's scan", async () => {
    vi.mocked(variants.presignVariantScanView).mockResolvedValue("https://signed/get" as never);
    const res = await presignVariantScanView("v1");
    expect(variants.presignVariantScanView).toHaveBeenCalledWith("owner-1", "v1");
    expect(res).toEqual({ ok: true, url: "https://signed/get" });
  });

  it("returns ok with a null url when no scan is attached", async () => {
    vi.mocked(variants.presignVariantScanView).mockResolvedValue(null as never);
    const res = await presignVariantScanView("v1");
    expect(res).toEqual({ ok: true, url: null });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(variants.presignVariantScanView).mockRejectedValue(
      new ServiceError("variantNotFound"),
    );
    const res = await presignVariantScanView("v1");
    expect(res).toEqual({ ok: false, error: "variantNotFound" });
  });
});
