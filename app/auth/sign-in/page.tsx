"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);

  return (
    <main className="center-screen">
      <form action={formAction} className="auth-card">
        <Link href="/" className="brand">
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>
        <h1 className="auth-title">Welcome back</h1>

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
          {isPending ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-sm muted">
          No account yet?{" "}
          <Link href="/auth/sign-up" className="link">
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}
