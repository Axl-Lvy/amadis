import { describe, expect, it } from "vitest";

import { resolveLocale } from "@/i18n/resolve-locale";

describe("resolveLocale", () => {
  it("prefers a valid cookie over the header", () => {
    expect(resolveLocale("fr", "en-US,en;q=0.9")).toBe("fr");
  });

  it("ignores an unsupported cookie and falls through to the header", () => {
    expect(resolveLocale("de", "fr-FR,fr;q=0.9")).toBe("fr");
  });

  it("matches the best supported language from Accept-Language", () => {
    expect(resolveLocale(undefined, "de-DE,fr;q=0.8,en;q=0.6")).toBe("fr");
  });

  it("matches a base language ignoring the region subtag", () => {
    expect(resolveLocale(undefined, "fr-CA")).toBe("fr");
  });

  it("falls back to en when nothing matches", () => {
    expect(resolveLocale(undefined, "de-DE,es;q=0.8")).toBe("en");
  });

  it("falls back to en when there is no cookie and no header", () => {
    expect(resolveLocale(undefined, null)).toBe("en");
  });
});
