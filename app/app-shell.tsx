"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/app/auth/actions";
import { LangToggle } from "@/app/lang-toggle";
import { ThemeToggle } from "@/app/theme-toggle";

type NavItem = {
  href: string;
  labelKey: "dashboard" | "books";
  icon: React.ReactNode;
  match: (p: string) => boolean;
};

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    labelKey: "dashboard",
    match: (p) => p === "/dashboard",
    icon: (
      <svg viewBox="0 0 16 16" width="17" height="17" fill="none" aria-hidden="true">
        <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.4" fill="currentColor" />
        <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
        <rect x="9" y="9" width="5.5" height="5.5" rx="1.4" fill="currentColor" />
      </svg>
    ),
  },
  {
    href: "/books",
    labelKey: "books",
    match: (p) => p === "/books" || p.startsWith("/books/"),
    icon: (
      <svg viewBox="0 0 16 16" width="17" height="17" fill="none" aria-hidden="true">
        <path
          d="M3.5 1.75h6L13 5.25v9A1.25 1.25 0 0 1 11.75 15.5h-8.25A1.25 1.25 0 0 1 2.25 14.25V3A1.25 1.25 0 0 1 3.5 1.75Z"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path d="M5 8.5h6M5 11h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function AppShell({
  user,
  children,
}: Readonly<{
  user: { name?: string | null; email?: string | null };
  children: React.ReactNode;
}>) {
  const pathname = usePathname() ?? "";
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="shell">
      <aside className="sidebar" data-open={open}>
        <Link href="/" className="brand" style={{ padding: "2px 4px 0" }} onClick={close}>
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>

        <nav className="nav">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="nav-item"
              aria-current={item.match(pathname) ? "page" : undefined}
              onClick={close}
            >
              <span className="nav-icon">{item.icon}</span>
              {t(`nav.${item.labelKey}`)}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user">
            <span className="avatar">{initial}</span>
            <span className="user-id">
              <span className="user-name">{user.name ?? t("common.defaultUserName")}</span>
              {user.email && <span className="user-email">{user.email}</span>}
            </span>
          </div>
          <div className="foot-actions">
            <ThemeToggle />
            <LangToggle />
            <form action={signOut} style={{ flex: 1 }}>
              <button type="submit" className="ghost" style={{ width: "100%", justifyContent: "center" }}>
                {t("nav.signOut")}
              </button>
            </form>
          </div>
        </div>
      </aside>

      {open && <div className="backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}

      <div className="shell-main">
        <header className="mobile-bar">
          <button
            type="button"
            className="ghost icon"
            aria-label={t("nav.openNavigation")}
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <Link href="/" className="brand">
            <span className="logo" />
            <span className="name">amadis</span>
          </Link>
          <ThemeToggle />
          <LangToggle />
        </header>

        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
}
