import { describe, expect, it } from "vitest";

import { defaultLocale, locales } from "@/i18n/config";

describe("i18n config", () => {
  it("declares exactly en and fr", () => {
    expect([...locales]).toEqual(["en", "fr"]);
  });

  it("defaults to en", () => {
    expect(defaultLocale).toBe("en");
    expect(locales).toContain(defaultLocale);
  });
});
