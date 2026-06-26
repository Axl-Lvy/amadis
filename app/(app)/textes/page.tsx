import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { createTexte, deleteTexte } from "./actions";

// Session + per-user reads depend on cookies, so this page is always dynamic.
export const dynamic = "force-dynamic";

export default async function TextesPage() {
  const user = await requireUser();
  const t = await getTranslations("textes");
  const tc = await getTranslations("common");

  const textes = await prisma.texte.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      source: true,
      scanKey: true,
      createdAt: true,
      _count: { select: { annotations: true } },
    },
  });

  return (
    <>
      <div className="content-header">
        <div>
          <h1>{t("title")}</h1>
          <p className="sub">{t("corpusCount", { count: textes.length })}</p>
        </div>
      </div>

      <div className="flex flex-col gap-7">
        <section className="card flex flex-col gap-3">
          <p className="section-label">{t("newTexte")}</p>
          <form action={createTexte} className="flex flex-col gap-3">
            <input
              name="reference"
              required
              placeholder={t("form.referencePlaceholder")}
              className="field"
            />
            <input name="source" placeholder={t("form.sourcePlaceholder")} className="field" />
            <textarea
              name="content"
              rows={4}
              placeholder={t("form.contentPlaceholder")}
              className="field"
              style={{ fontFamily: "var(--font-serif)", resize: "vertical" }}
            />
            <button type="submit" className="btn btn-primary self-start">
              {t("form.submit")}
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <p className="section-label">{t("myTextes")}</p>
          <div className="list">
            {textes.map((texte) => (
              <div key={texte.id} className="row">
                <div className="flex flex-col">
                  <Link href={`/textes/${texte.id}`} className="title">
                    {texte.reference}
                  </Link>
                  <span className="sub">
                    {t("list.annotationCount", { count: texte._count.annotations })}
                    {texte.scanKey ? t("list.hasScan") : ""}
                    {texte.source ? ` · ${texte.source}` : ""}
                  </span>
                </div>
                <form action={deleteTexte}>
                  <input type="hidden" name="id" value={texte.id} />
                  <button type="submit" className="btn btn-ghost">
                    {tc("delete")}
                  </button>
                </form>
              </div>
            ))}
            {textes.length === 0 && (
              <p className="text-sm muted">{t("empty")}</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
