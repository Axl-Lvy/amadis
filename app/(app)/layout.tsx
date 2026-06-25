import { redirect } from "next/navigation";

import { AppShell } from "@/app/app-shell";
import { auth } from "@/lib/auth/server";

// Every page in this group reads the session, so the shell renders dynamically
// and guards the whole authenticated area in one place.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  return (
    <AppShell user={{ name: session.user.name, email: session.user.email }}>
      {children}
    </AppShell>
  );
}
