"use server";

import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth/server";

export async function signUpWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const t = await getTranslations("errors");
  const email = formData.get("email") as string;

  if (!email) {
    return { error: t("emailRequired") };
  }

  const { error } = await auth.signUp.email({
    email,
    name: formData.get("name") as string,
    password: formData.get("password") as string,
  });

  if (error) {
    return { error: error.message || t("signUpFailed") };
  }

  redirect("/dashboard");
}
