import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { createTexte, deleteTexte } from "./actions";

// Session + per-user reads depend on cookies, so this page is always dynamic.
export const dynamic = "force-dynamic";

export default async function TextesPage() {
  const user = await requireUser();

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
          <h1>Textes</h1>
          <p className="sub">{textes.length} in your corpus</p>
        </div>
      </div>

      <div className="flex flex-col gap-7">
        <section className="card flex flex-col gap-3">
          <p className="section-label">New texte</p>
          <form action={createTexte} className="flex flex-col gap-3">
            <input
              name="reference"
              required
              placeholder="Reference (e.g. Roland, ms. Oxford f.1r)"
              className="field"
            />
            <input name="source" placeholder="Source (optional)" className="field" />
            <textarea
              name="content"
              rows={4}
              placeholder="Paste a transcription (optional — you can scan first and transcribe later)"
              className="field"
              style={{ fontFamily: "var(--font-serif)", resize: "vertical" }}
            />
            <button type="submit" className="btn btn-primary self-start">
              Create texte
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-3">
          <p className="section-label">My textes</p>
          <div className="list">
            {textes.map((t) => (
              <div key={t.id} className="row">
                <div className="flex flex-col">
                  <Link href={`/textes/${t.id}`} className="title">
                    {t.reference}
                  </Link>
                  <span className="sub">
                    {t._count.annotations} annotation
                    {t._count.annotations === 1 ? "" : "s"}
                    {t.scanKey ? " · has scan" : ""}
                    {t.source ? ` · ${t.source}` : ""}
                  </span>
                </div>
                <form action={deleteTexte}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="btn btn-ghost">
                    Delete
                  </button>
                </form>
              </div>
            ))}
            {textes.length === 0 && (
              <p className="text-sm muted">No textes yet. Create one above to begin.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
