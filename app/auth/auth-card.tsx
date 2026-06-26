"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function Field({
  label,
  name,
  type,
}: Readonly<{ label: string; name: string; type: string }>) {
  return (
    <label className="label">
      <span>{label}</span>
      <input name={name} type={type} required className="field" />
    </label>
  );
}

// Shared scaffolding for the sign-in and sign-up screens: brand, title, the
// caller's field rows, an optional error, the submit button and a footer link.
export function AuthCard({
  action,
  isPending,
  error,
  title,
  submitLabel,
  pendingLabel,
  footerPrompt,
  footerLinkLabel,
  footerHref,
  children,
}: Readonly<{
  action: (payload: FormData) => void;
  isPending: boolean;
  error?: string;
  title: string;
  submitLabel: string;
  pendingLabel: string;
  footerPrompt: string;
  footerLinkLabel: string;
  footerHref: string;
  children: ReactNode;
}>) {
  return (
    <main className="center-screen">
      <form action={action} className="auth-card">
        <Link href="/" className="brand">
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>
        <h1 className="auth-title">{title}</h1>

        {children}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={isPending} className="btn btn-primary btn-block">
          {isPending ? pendingLabel : submitLabel}
        </button>

        <p className="text-sm muted">
          {footerPrompt}{" "}
          <Link href={footerHref} className="link">
            {footerLinkLabel}
          </Link>
        </p>
      </form>
    </main>
  );
}
