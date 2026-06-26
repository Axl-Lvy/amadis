"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { AuthCard, Field } from "../auth-card";
import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);
  const t = useTranslations("auth");

  return (
    <AuthCard
      action={formAction}
      isPending={isPending}
      error={state?.error}
      title={t("signIn.title")}
      submitLabel={t("signIn.submit")}
      pendingLabel={t("signIn.submitPending")}
      footerPrompt={t("signIn.noAccountPrompt")}
      footerLinkLabel={t("signIn.createOneLink")}
      footerHref="/auth/sign-up"
    >
      <Field label={t("fields.email")} name="email" type="email" />
      <Field label={t("fields.password")} name="password" type="password" />
    </AuthCard>
  );
}
