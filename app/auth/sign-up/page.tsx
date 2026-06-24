"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUpWithEmail } from "./actions";

export default function SignUpPage() {
  const [state, formAction, isPending] = useActionState(signUpWithEmail, null);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-bold">Create your account</h1>

        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            name="name"
            type="text"
            required
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            name="email"
            type="email"
            required
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            className="rounded-md border border-black/15 px-3 py-2 dark:border-white/20"
          />
        </label>

        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-foreground px-3 py-2 font-medium text-background disabled:opacity-60"
        >
          {isPending ? "Creating account..." : "Create account"}
        </button>

        <p className="text-sm">
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
