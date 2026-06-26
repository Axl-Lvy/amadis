import { beforeEach, describe, expect, it, vi } from "vitest";

const signUpEmail = vi.fn();
const redirect = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: { signUp: { email: (args: unknown) => signUpEmail(args) } },
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

import { signUpWithEmail } from "./actions";

function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

describe("signUpWithEmail", () => {
  beforeEach(() => {
    signUpEmail.mockReset();
    redirect.mockReset();
  });

  it("requires an email before calling the provider", async () => {
    const result = await signUpWithEmail(null, form({ name: "A", password: "x" }));
    expect(result).toEqual({ error: "Email address must be provided." });
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it("returns the translated fallback when sign-up fails without a message", async () => {
    signUpEmail.mockResolvedValue({ error: { message: "" } });
    const result = await signUpWithEmail(
      null,
      form({ email: "a@b.c", name: "A", password: "x" }),
    );
    expect(result).toEqual({ error: "Failed to create account" });
  });

  it("redirects to the dashboard on success", async () => {
    signUpEmail.mockResolvedValue({ error: null });
    await signUpWithEmail(null, form({ email: "a@b.c", name: "A", password: "x" }));
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
