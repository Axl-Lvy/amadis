"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { setLocale } from "@/app/i18n-actions";
import type { Locale } from "@/i18n/config";

const LABEL: Record<Locale, string> = { en: "EN", fr: "FR" };
const ARIA: Record<Locale, string> = {
  en: "Passer en français",
  fr: "Switch to English",
};

export function LangToggle() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const next: Locale = locale === "en" ? "fr" : "en";

  function switchTo() {
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      disabled={isPending}
      className="ghost icon"
      aria-label={ARIA[locale]}
      title={ARIA[locale]}
    >
      {LABEL[next]}
    </button>
  );
}
