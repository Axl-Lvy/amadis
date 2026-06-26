import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("dashboard");

  // Per-user counts (every table is owner-scoped) plus the managed auth identity table.
  const [texteCount, tagCount, annotationCount, authUsers] = await Promise.all([
    prisma.texte.count({ where: { ownerId } }),
    prisma.tag.count({ where: { ownerId } }),
    prisma.annotation.count({ where: { ownerId } }),
    prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM neon_auth."user"`,
  ]);

  const mine: [string, number][] = [
    ["textes", texteCount],
    ["tags", tagCount],
    ["annotations", annotationCount],
  ];

  return (
    <>
      <div className="content-header">
        <div>
          <h1>{t("title")}</h1>
          <p className="sub">{t("signedInAs", { name: session.user.name })}</p>
        </div>
        <Link href="/textes" className="btn btn-primary" style={{ textDecoration: "none" }}>
          {t("openMyTextes")}
        </Link>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        {mine.map(([name, count]) => (
          <section key={name} className="card flex flex-col gap-1">
            <p className="section-label">{t(`stats.${name}`)}</p>
            <span
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 44,
                lineHeight: 1.1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </span>
          </section>
        ))}
      </div>

      <p className="text-xs muted" style={{ marginTop: 20 }}>
        {t("scholarCount", { count: authUsers[0]?.count ?? 0 })}
      </p>
    </>
  );
}
