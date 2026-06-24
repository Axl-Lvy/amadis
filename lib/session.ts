import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/server";

// Server-side guard for pages: returns the signed-in user or redirects to sign-in.
export async function requireUser() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }
  return session.user;
}

// Server-action guard: returns the user id or throws (actions cannot redirect cleanly).
export async function requireUserId() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  return session.user.id;
}
