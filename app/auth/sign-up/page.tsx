"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);

  return (
    <main className="center-screen">
      <form action={formAction} className="auth-card">
        <Link href="/" className="brand">
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>
        <h1 className="auth-title">Create your account</h1>

        <label className="label">
          Name
          <input name="name" type="text" required className="field" />
        </label>

        <label className="label">
          Email
          <input name="email" type="email" required className="field" />
        </label>

        <label className="label">
          Password
          <input name="password" type="password" required className="field" />
        </label>

        {state?.error && <p className="error">{state.error}</p>}

        <button type="submit" disabled={isPending} className="btn btn-primary btn-block">
          {isPending ? "Creating account…" : "Create account"}
        </button>

        <p className="text-sm muted">
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="link">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
