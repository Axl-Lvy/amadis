import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { createTag, presignScanView } from "./actions";
import { Annotator } from "./annotator";
import { ScanUploader } from "./scan-uploader";

// Session + per-user reads depend on cookies, so this page is always dynamic.
export const dynamic = "force-dynamic";

export default async function TextePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const ownerId = user.id;
  const t = await getTranslations("texteDetail");

  const texte = await prisma.texte.findFirst({
    where: { id, ownerId },
    select: { id: true, reference: true, content: true, source: true, scanKey: true },
  });
  if (!texte) {
    notFound();
  }

  // All reads are owner-scoped; no cross-user data is ever returned.
  const [tags, annotationRows, byTag, byLayer, scanUrl] = await Promise.all([
    prisma.tag.findMany({
      where: { ownerId },
      orderBy: [{ layer: "asc" }, { code: "asc" }],
    }),
    prisma.annotation.findMany({
      where: { ownerId, texteId: id },
      orderBy: [{ start: "asc" }, { end: "asc" }],
      include: { tag: true },
    }),
    prisma.annotation.groupBy({
      by: ["tagId"],
      where: { ownerId, texteId: id },
      _count: { _all: true },
    }),
    prisma.$queryRaw<{ layer: string; count: number }[]>`
      SELECT t.layer, count(*)::int AS count
      FROM annotation a
      JOIN tag t ON t.id = a.tag_id
      WHERE a.owner_id = ${ownerId} AND a.texte_id = ${id}
      GROUP BY t.layer
      ORDER BY t.layer`,
    presignScanView(id),
  ]);

  const tagById = new Map(tags.map((t) => [t.id, t]));
  const tagCounts = byTag
    .map((g) => ({ tag: tagById.get(g.tagId), count: g._count._all }))
    .filter((r) => r.tag)
    .sort((a, b) => b.count - a.count);

  const annotations = annotationRows.map((a) => ({
    id: a.id,
    start: a.start,
    end: a.end,
    tagId: a.tagId,
    layer: a.tag.layer,
    code: a.tag.code,
    label: a.tag.label,
    note: a.note,
  }));

  return (
    <>
      <div className="content-header">
        <div>
          <h1>{texte.reference}</h1>
          {texte.source && <p className="sub">{texte.source}</p>}
        </div>
        <Link href="/textes" className="btn btn-ghost" style={{ textDecoration: "none" }}>
          {t("allTextes")}
        </Link>
      </div>

      <div className="flex flex-col gap-7">
        <Annotator
          texteId={texte.id}
          content={texte.content}
          tags={tags.map((t) => ({
            id: t.id,
            layer: t.layer,
            code: t.code,
            label: t.label,
          }))}
          annotations={annotations}
        />

        <div className="grid gap-5 md:grid-cols-2">
          {/* Scan */}
          <section className="card flex flex-col gap-3">
            <p className="section-label">{t("scan.label")}</p>
            {scanUrl ? (
              // Presigned URL rotates, so a plain img avoids next/image caching.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={scanUrl}
                alt={t("scan.alt", { reference: texte.reference })}
                className="max-h-[26rem] w-auto rounded-lg"
                style={{ border: "1px solid var(--line-2)" }}
              />
            ) : (
              <p className="text-sm muted">{t("scan.empty")}</p>
            )}
            <ScanUploader texteId={texte.id} />
          </section>

          {/* Tags */}
          <section className="card flex flex-col gap-3">
            <p className="section-label">{t("tags.label")}</p>
            <form action={createTag} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="texteId" value={texte.id} />
              <input name="layer" required placeholder={t("tags.layerPlaceholder")} className="field" />
              <input name="code" required placeholder={t("tags.codePlaceholder")} className="field" />
              <input name="label" placeholder={t("tags.labelPlaceholder")} className="field" />
              <button type="submit" className="btn btn-primary">
                {t("tags.addButton")}
              </button>
            </form>
            <p className="text-xs muted">
              {tags.length === 0
                ? t("tags.empty")
                : tags.map((tag) => `${tag.layer}:${tag.code}`).join("  ·  ")}
            </p>
          </section>

          {/* Tallies */}
          <section className="card flex flex-col gap-2">
            <p className="section-label">{t("tallies.perTag")}</p>
            <table className="stat-table">
              <tbody>
                {tagCounts.map(({ tag, count }) => (
                  <tr key={tag!.id}>
                    <td>
                      {tag!.layer}:{tag!.code}
                    </td>
                    <td>{count}</td>
                  </tr>
                ))}
                {tagCounts.length === 0 && (
                  <tr>
                    <td className="muted">{t("tallies.noAnnotations")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="card flex flex-col gap-2">
            <p className="section-label">{t("tallies.perLayer")}</p>
            <table className="stat-table">
              <tbody>
                {byLayer.map((r) => (
                  <tr key={r.layer}>
                    <td>{r.layer}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
                {byLayer.length === 0 && (
                  <tr>
                    <td className="muted">{t("tallies.noAnnotations")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  );
}
