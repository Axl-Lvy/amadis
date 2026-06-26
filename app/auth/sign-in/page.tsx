"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);
  const t = useTranslations("auth");

  return (
    <main className="center-screen">
      <form action={formAction} className="auth-card">
        <Link href="/" className="brand">
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>
        <h1 className="auth-title">{t("signIn.title")}</h1>

        <label className="label">
          <span>{t("fields.email")}</span>
          <input name="email" type="email" required className="field" />
        </label>

        <label className="label">
          <span>{t("fields.password")}</span>
          <input name="password" type="password" required className="field" />
        </label>

        {state?.error && <p className="error">{state.error}</p>}

        <button type="submit" disabled={isPending} className="btn btn-primary btn-block">
          {isPending ? t("signIn.submitPending") : t("signIn.submit")}
        </button>

        <p className="text-sm muted">
          {t("signIn.noAccountPrompt")}{" "}
          <Link href="/auth/sign-up" className="link">
            {t("signIn.createOneLink")}
          </Link>
        </p>
      </form>
    </main>
  );
}
