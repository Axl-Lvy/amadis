import { defaultLocale, locales, type Locale } from "@/i18n/config";

function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

// Parse an Accept-Language header into base language codes ordered by q-weight.
function rankedLanguages(header: string): string[] {
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { base: tag.toLowerCase().split("-")[0], weight: Number.isNaN(weight) ? 0 : weight };
    })
    .filter((entry) => entry.base.length > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((entry) => entry.base);
}

export function resolveLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null,
): Locale {
  if (cookieValue && isLocale(cookieValue)) {
    return cookieValue;
  }
  if (acceptLanguage) {
    for (const base of rankedLanguages(acceptLanguage)) {
      if (isLocale(base)) {
        return base;
      }
    }
  }
  return defaultLocale;
}
