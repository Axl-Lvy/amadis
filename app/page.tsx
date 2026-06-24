import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { auth } from "@/lib/auth/server";

// Reads the session from cookies, so it must render dynamically.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { data: session } = await auth.getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">amadis</h1>
      <p className="text-sm opacity-70">French-linguistics annotation tool</p>

      {session?.user ? (
        <div className="flex flex-col items-center gap-4">
          <p>
            Signed in as <span className="font-semibold">{session.user.name}</span>
          </p>
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-foreground px-4 py-2 font-medium text-background"
            >
              Open dashboard
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-md border border-black/15 px-4 py-2 dark:border-white/20"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link
            href="/auth/sign-in"
            className="rounded-md bg-foreground px-4 py-2 font-medium text-background"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="rounded-md border border-black/15 px-4 py-2 dark:border-white/20"
          >
            Sign up
          </Link>
        </div>
      )}
    </main>
  );
}
