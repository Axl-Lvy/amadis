"use server";

import { cookies } from "next/headers";

import { locales, type Locale } from "@/i18n/config";

export async function setLocale(locale: Locale): Promise<void> {
  if (!(locales as readonly string[]).includes(locale)) {
    return;
  }
  const cookieStore = await cookies();
  // One year, root path, so every route resolves the chosen locale.
  cookieStore.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}
