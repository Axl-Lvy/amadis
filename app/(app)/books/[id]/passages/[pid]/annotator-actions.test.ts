import { beforeEach, describe, expect, it, vi } from "vitest";

import { ServiceError } from "@/lib/services/errors";

import {
  createPlacement,
  createRef,
  deletePlacement,
  deleteRef,
  listRefsForPlacement,
  searchMentionTargets,
  updatePlacement,
} from "./annotator-actions";

// Wrappers over the placements / references / search services. Mock all three;
// errors.ts stays real so the {ok:false,error} translation branch runs, and
// getTranslations echoes the key so the error equals the ServiceError code.
vi.mock("@/lib/services/placements", () => ({
  createPlacement: vi.fn(),
  updatePlacement: vi.fn(),
  deletePlacement: vi.fn(),
}));
vi.mock("@/lib/services/references", () => ({
  createRef: vi.fn(),
  deleteRef: vi.fn(),
  listRefsFor: vi.fn(),
}));
vi.mock("@/lib/services/search", () => ({
  searchMentionTargets: vi.fn(),
}));
vi.mock("@/lib/session", () => ({
  requireUserId: () => Promise.resolve("owner-1"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string) => k,
}));

import {
  createPlacement as createPlacementSvc,
  deletePlacement as deletePlacementSvc,
  updatePlacement as updatePlacementSvc,
} from "@/lib/services/placements";
import {
  createRef as createRefSvc,
  deleteRef as deleteRefSvc,
  listRefsFor as listRefsForSvc,
} from "@/lib/services/references";
import { searchMentionTargets as searchMentionTargetsSvc } from "@/lib/services/search";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createPlacement", () => {
  it("creates a placement for the owner and returns its id", async () => {
    vi.mocked(createPlacementSvc).mockResolvedValue({ id: "pl1" } as never);
    const input = {
      passageId: "p1",
      field: "TEXT" as const,
      start: 0,
      end: 2,
      tagIds: ["t1"],
    };
    const res = await createPlacement("b1", input);
    expect(createPlacementSvc).toHaveBeenCalledWith("owner-1", input);
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true, id: "pl1" });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(createPlacementSvc).mockRejectedValue(new ServiceError("emptyPlacement"));
    const res = await createPlacement("b1", {
      passageId: "p1",
      field: "TEXT",
      start: 0,
      end: 1,
    });
    expect(res).toEqual({ ok: false, error: "emptyPlacement" });
  });

  it("rethrows a non-ServiceError", async () => {
    vi.mocked(createPlacementSvc).mockRejectedValue(new Error("boom"));
    await expect(
      createPlacement("b1", { passageId: "p1", field: "TEXT", start: 0, end: 1 }),
    ).rejects.toThrow("boom");
  });
});

describe("updatePlacement", () => {
  it("updates and revalidates the passage page", async () => {
    vi.mocked(updatePlacementSvc).mockResolvedValue(undefined as never);
    const res = await updatePlacement("b1", "p1", "pl1", { description: "new" });
    expect(updatePlacementSvc).toHaveBeenCalledWith("owner-1", "pl1", { description: "new" });
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(updatePlacementSvc).mockRejectedValue(new ServiceError("placementNotFound"));
    const res = await updatePlacement("b1", "p1", "pl1", { tagIds: [] });
    expect(res).toEqual({ ok: false, error: "placementNotFound" });
  });
});

describe("deletePlacement", () => {
  it("deletes the owner's placement and revalidates", async () => {
    vi.mocked(deletePlacementSvc).mockResolvedValue(undefined as never);
    const res = await deletePlacement("b1", "p1", "pl1");
    expect(deletePlacementSvc).toHaveBeenCalledWith("owner-1", "pl1");
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });
});

describe("createRef", () => {
  it("creates a cross-reference for the owner and returns its id", async () => {
    vi.mocked(createRefSvc).mockResolvedValue({ id: "r1" } as never);
    const input = { sourceId: "pl1", targetType: "PASSAGE" as const, targetId: "p2" };
    const res = await createRef("b1", "p1", input);
    expect(createRefSvc).toHaveBeenCalledWith("owner-1", input);
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true, id: "r1" });
  });

  it("translates a ServiceError", async () => {
    vi.mocked(createRefSvc).mockRejectedValue(new ServiceError("refTargetNotFound"));
    const res = await createRef("b1", "p1", {
      sourceId: "pl1",
      targetType: "PASSAGE",
      targetId: "missing",
    });
    expect(res).toEqual({ ok: false, error: "refTargetNotFound" });
  });
});

describe("deleteRef", () => {
  it("removes the owner's reference and revalidates", async () => {
    vi.mocked(deleteRefSvc).mockResolvedValue(undefined as never);
    const res = await deleteRef("b1", "p1", "r1");
    expect(deleteRefSvc).toHaveBeenCalledWith("owner-1", "r1");
    expect(revalidatePath).toHaveBeenCalledWith("/books/b1/passages/p1");
    expect(res).toEqual({ ok: true });
  });
});

describe("listRefsForPlacement", () => {
  it("passes the owner id and returns the service result", async () => {
    const rows = [{ id: "r1" }];
    vi.mocked(listRefsForSvc).mockResolvedValue(rows as never);
    const res = await listRefsForPlacement("pl1");
    expect(listRefsForSvc).toHaveBeenCalledWith("owner-1", "pl1");
    expect(res).toBe(rows);
  });
});

describe("searchMentionTargets", () => {
  it("passes the owner id, query and limit through (read-only)", async () => {
    const hits = [{ type: "PASSAGE", id: "p1", label: "x", href: "/x" }];
    vi.mocked(searchMentionTargetsSvc).mockResolvedValue(hits as never);
    const res = await searchMentionTargets("rol", 5);
    expect(searchMentionTargetsSvc).toHaveBeenCalledWith("owner-1", "rol", 5);
    expect(res).toBe(hits);
  });

  it("forwards an undefined limit", async () => {
    vi.mocked(searchMentionTargetsSvc).mockResolvedValue([] as never);
    await searchMentionTargets("q");
    expect(searchMentionTargetsSvc).toHaveBeenCalledWith("owner-1", "q", undefined);
  });
});
