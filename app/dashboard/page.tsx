import { redirect } from "next/navigation";

import { signOut } from "@/app/auth/actions";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/prisma";

// Session + DB reads depend on cookies and live data.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { data: session } = await auth.getSession();

  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const ownerId = session.user.id;

  // Per-user counts (every table is owner-scoped) plus the managed auth identity table.
  const [texteCount, tagCount, annotationCount, authUsers] = await Promise.all([
    prisma.texte.count({ where: { ownerId } }),
    prisma.tag.count({ where: { ownerId } }),
    prisma.annotation.count({ where: { ownerId } }),
    prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM neon_auth."user"`,
  ]);

  const rows: [string, number][] = [
    ["texte (mine)", texteCount],
    ["tag (mine)", tagCount],
    ["annotation (mine)", annotationCount],
    ["neon_auth.user (all)", authUsers[0]?.count ?? 0],
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Sign out
          </button>
        </form>
      </div>

      <p className="text-sm">
        Signed in as <span className="font-semibold">{session.user.name}</span>{" "}
        <span className="opacity-60">({session.user.email})</span>
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Row counts
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {rows.map(([name, count]) => (
              <tr key={name} className="border-b border-black/10 dark:border-white/10">
                <td className="py-2 font-mono">{name}</td>
                <td className="py-2 text-right tabular-nums">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
