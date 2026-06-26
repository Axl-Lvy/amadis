"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { AuthCard, Field } from "../auth-card";
import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);
  const t = useTranslations("auth");

  return (
    <AuthCard
      action={formAction}
      isPending={isPending}
      error={state?.error}
      title={t("signUp.title")}
      submitLabel={t("signUp.submit")}
      pendingLabel={t("signUp.submitPending")}
      footerPrompt={t("signUp.haveAccountPrompt")}
      footerLinkLabel={t("signUp.signInLink")}
      footerHref="/auth/sign-in"
    >
      <Field label={t("fields.name")} name="name" type="text" />
      <Field label={t("fields.email")} name="email" type="email" />
      <Field label={t("fields.password")} name="password" type="password" />
    </AuthCard>
  );
}
