import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { createTexte, deleteTexte } from "./actions";

const prisma = mockDeep<typeof import("@/lib/prisma").prisma>();
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("@/lib/prisma", () => ({ get prisma() { return prisma; } }));
vi.mock("@/lib/session", () => ({ requireUserId: () => Promise.resolve("owner-1") }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
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
  redirect.mockClear();
});

describe("createTexte", () => {
  it("scopes to the caller, NFC-normalizes content, and redirects to the new texte", async () => {
    prisma.texte.create.mockResolvedValue({ id: "t1" } as never);

    // "e" + combining acute should be stored composed.
    await expect(createTexte(form({ reference: "Ref", content: "café" }))).rejects.toThrow(
      "REDIRECT:/textes/t1",
    );

    const data = prisma.texte.create.mock.calls[0][0].data as {
      ownerId: string;
      content: string;
      source: string | null;
    };
    expect(data.ownerId).toBe("owner-1");
    expect(data.content).toBe("café"); // composed, length 4 code points
    expect(data.content.normalize("NFC")).toBe(data.content);
    expect(redirect).toHaveBeenCalledWith("/textes/t1");
  });

  it("rejects an empty reference before touching the database", async () => {
    await expect(createTexte(form({ reference: "  ", content: "x" }))).rejects.toThrow(
      "Reference is required",
    );
    expect(prisma.texte.create).not.toHaveBeenCalled();
  });

  it("stores a null source when none is given", async () => {
    prisma.texte.create.mockResolvedValue({ id: "t2" } as never);
    await expect(createTexte(form({ reference: "Ref" }))).rejects.toThrow("REDIRECT");
    const data = prisma.texte.create.mock.calls[0][0].data as { source: string | null };
    expect(data.source).toBeNull();
  });
});

describe("deleteTexte", () => {
  it("deletes only rows owned by the caller", async () => {
    prisma.texte.deleteMany.mockResolvedValue({ count: 1 } as never);
    await deleteTexte(form({ id: "t9" }));
    expect(prisma.texte.deleteMany).toHaveBeenCalledWith({
      where: { id: "t9", ownerId: "owner-1" },
    });
  });
});
