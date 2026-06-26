import { beforeEach, describe, expect, it, vi } from "vitest";

const signInEmail = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: { signIn: { email: (args: unknown) => signInEmail(args) } },
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => redirect(path) }));
vi.mock("next-intl/server", async () => {
  const en = (await import("@/messages/en.json")).default as Record<string, unknown>;
  const get = (obj: unknown, path: string): unknown =>
    path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
  return {
    getTranslations: async (ns: string) => (key: string) => get(en, `${ns}.${key}`) as string,
  };
});

import { signInWithEmail } from "./actions";

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("signInWithEmail", () => {
  beforeEach(() => {
    signInEmail.mockReset();
    redirect.mockReset();
  });

  it("returns the translated fallback when sign-in fails without a message", async () => {
    signInEmail.mockResolvedValue({ error: { message: "" } });
    const result = await signInWithEmail(null, form({ email: "a@b.c", password: "x" }));
    expect(result).toEqual({ error: "Failed to sign in. Try again." });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("surfaces the provider error message when present", async () => {
    signInEmail.mockResolvedValue({ error: { message: "Bad credentials" } });
    const result = await signInWithEmail(null, form({ email: "a@b.c", password: "x" }));
    expect(result).toEqual({ error: "Bad credentials" });
  });

  it("redirects to the dashboard on success", async () => {
    signInEmail.mockResolvedValue({ error: null });
    await signInWithEmail(null, form({ email: "a@b.c", password: "x" }));
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
