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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My textes</h1>
        <Link href="/dashboard" className="text-sm underline opacity-70">
          Dashboard
        </Link>
      </div>

      <form
        action={createTexte}
        className="flex flex-col gap-3 rounded-lg border border-black/15 p-4 dark:border-white/20"
      >
        <h2 className="font-semibold">New texte</h2>
        <input
          name="reference"
          required
          placeholder="Reference (e.g. Roland, ms. Oxford f.1r)"
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        />
        <input
          name="source"
          placeholder="Source (optional)"
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
        />
        <textarea
          name="content"
          rows={4}
          placeholder="Paste a transcription (optional — you can scan first and transcribe later)"
          className="rounded-md border border-black/15 px-3 py-1.5 font-mono text-sm dark:border-white/20"
        />
        <button
          type="submit"
          className="self-start rounded-md bg-black px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black"
        >
          Create
        </button>
      </form>

      <ul className="flex flex-col gap-2">
        {textes.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between rounded-md border border-black/10 px-4 py-3 dark:border-white/15"
          >
            <div className="flex flex-col">
              <Link href={`/textes/${t.id}`} className="font-medium underline">
                {t.reference}
              </Link>
              <span className="text-xs opacity-60">
                {t._count.annotations} annotation(s)
                {t.scanKey ? " · has scan" : ""}
                {t.source ? ` · ${t.source}` : ""}
              </span>
            </div>
            <form action={deleteTexte}>
              <input type="hidden" name="id" value={t.id} />
              <button
                type="submit"
                className="rounded-md border border-black/15 px-2 py-1 text-xs opacity-70 dark:border-white/20"
              >
                Delete
              </button>
            </form>
          </li>
        ))}
        {textes.length === 0 && (
          <li className="text-sm opacity-60">No textes yet. Create one above.</li>
        )}
      </ul>
    </main>
  );
}
