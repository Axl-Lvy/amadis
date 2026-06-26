"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);
  const t = useTranslations("auth");

  return (
    <main className="center-screen">
      <form action={formAction} className="auth-card">
        <Link href="/" className="brand">
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>
        <h1 className="auth-title">{t("signUp.title")}</h1>

        <label className="label">
          <span>{t("fields.name")}</span>
          <input name="name" type="text" required className="field" />
        </label>

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
          {isPending ? t("signUp.submitPending") : t("signUp.submit")}
        </button>

        <p className="text-sm muted">
          {t("signUp.haveAccountPrompt")}{" "}
          <Link href="/auth/sign-in" className="link">
            {t("signUp.signInLink")}
          </Link>
        </p>
      </form>
    </main>
  );
}
