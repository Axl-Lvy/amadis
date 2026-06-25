import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser, requireUserId } from "./session";

const getSession = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  auth: { getSession: () => getSession() },
}));

// redirect() in Next never returns: it throws to unwind. Mirror that here so the
// guard's control flow under "no session" is exercised faithfully.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

beforeEach(() => {
  getSession.mockReset();
});

describe("requireUser", () => {
  it("returns the user when a session exists", async () => {
    const user = { id: "u1", name: "Ada" };
    getSession.mockResolvedValue({ data: { user } });
    await expect(requireUser()).resolves.toEqual(user);
  });

  it("redirects to sign-in when there is no session", async () => {
    getSession.mockResolvedValue({ data: null });
    await expect(requireUser()).rejects.toThrow("REDIRECT:/auth/sign-in");
  });
});

describe("requireUserId", () => {
  it("returns the user id when a session exists", async () => {
    getSession.mockResolvedValue({ data: { user: { id: "u1" } } });
    await expect(requireUserId()).resolves.toBe("u1");
  });

  it("throws Unauthorized when there is no session", async () => {
    getSession.mockResolvedValue({ data: null });
    await expect(requireUserId()).rejects.toThrow("Unauthorized");
  });
});
