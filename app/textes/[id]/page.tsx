import Link from "next/link";
import { notFound } from "next/navigation";

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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{texte.reference}</h1>
        <Link href="/textes" className="text-sm underline opacity-70">
          All textes
        </Link>
      </div>
      {texte.source && <p className="text-sm opacity-60">{texte.source}</p>}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Scan</h2>
        {scanUrl ? (
          // Presigned URL rotates, so a plain img avoids next/image caching/proxying.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={scanUrl}
            alt={`Scan of ${texte.reference}`}
            className="max-h-[28rem] w-auto rounded-md border border-black/15 dark:border-white/20"
          />
        ) : (
          <p className="text-sm opacity-60">No scan uploaded.</p>
        )}
        <ScanUploader texteId={texte.id} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">Tags</h2>
        <form action={createTag} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="texteId" value={texte.id} />
          <input
            name="layer"
            required
            placeholder="layer (e.g. pos)"
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/20"
          />
          <input
            name="code"
            required
            placeholder="code (e.g. NOUN)"
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/20"
          />
          <input
            name="label"
            placeholder="label (optional)"
            className="rounded-md border border-black/15 px-2 py-1 dark:border-white/20"
          />
          <button
            type="submit"
            className="rounded-md bg-black px-3 py-1 text-white dark:bg-white dark:text-black"
          >
            Add tag
          </button>
        </form>
        <p className="text-xs opacity-60">
          {tags.length === 0
            ? "No tags yet. Create one to start annotating."
            : tags.map((t) => `${t.layer}:${t.code}`).join("  ·  ")}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
          Annotate
        </h2>
        <Annotator
          texteId={texte.id}
          content={texte.content}
          tags={tags.map((t) => ({ id: t.id, layer: t.layer, code: t.code, label: t.label }))}
          annotations={annotations}
        />
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Per tag
          </h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {tagCounts.map(({ tag, count }) => (
                <tr key={tag!.id} className="border-b border-black/10 dark:border-white/10">
                  <td className="py-1 font-mono">
                    {tag!.layer}:{tag!.code}
                  </td>
                  <td className="py-1 text-right tabular-nums">{count}</td>
                </tr>
              ))}
              {tagCounts.length === 0 && (
                <tr>
                  <td className="py-1 opacity-60">No annotations.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
            Per layer
          </h2>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {byLayer.map((r) => (
                <tr key={r.layer} className="border-b border-black/10 dark:border-white/10">
                  <td className="py-1 font-mono">{r.layer}</td>
                  <td className="py-1 text-right tabular-nums">{r.count}</td>
                </tr>
              ))}
              {byLayer.length === 0 && (
                <tr>
                  <td className="py-1 opacity-60">No annotations.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
