"use client";

import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";

// The theme lives on <html data-theme>; the no-flash script in the root layout
// sets it before paint. We read it as an external store (SSR-safe, no effect)
// so the toggle label always reflects the real DOM state.
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): "dark" | "light" {
  return "dark";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const t = useTranslations("common.theme");

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("amadis-theme", next);
    } catch {
      // ignore unavailable storage
    }
    listeners.forEach((l) => l());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="ghost icon"
      aria-label={theme === "dark" ? t("switchToLightAria") : t("switchToDarkAria")}
      title={theme === "dark" ? t("switchToLightTitle") : t("switchToDarkTitle")}
    >
      {theme === "dark" ? "☀︎" : "☾"}
    </button>
  );
}
