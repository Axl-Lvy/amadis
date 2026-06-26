import { beforeEach, describe, expect, it, vi } from "vitest";

const set = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set })),
}));

import { setLocale } from "./i18n-actions";

describe("setLocale", () => {
  beforeEach(() => {
    set.mockClear();
  });

  it("writes a year-long root-path NEXT_LOCALE cookie for a supported locale", async () => {
    await setLocale("fr");
    expect(set).toHaveBeenCalledWith("NEXT_LOCALE", "fr", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  });

  it("ignores an unsupported locale and writes nothing", async () => {
    // @ts-expect-error testing the runtime guard against an invalid value
    await setLocale("de");
    expect(set).not.toHaveBeenCalled();
  });
});
