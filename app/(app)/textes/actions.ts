"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getString } from "@/lib/forms";
import { toNFC } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

// Create a texte. Content is optional (a scan can come first, transcription later)
// and is NFC-normalized so annotation offsets are computed against stable text.
export async function createTexte(formData: FormData) {
  const ownerId = await requireUserId();

  const reference = getString(formData, "reference").trim();
  if (!reference) {
    const t = await getTranslations("errors");
    throw new Error(t("referenceRequired"));
  }
  const rawContent = getString(formData, "content");
  const source = getString(formData, "source").trim() || null;

  const texte = await prisma.texte.create({
    data: {
      ownerId,
      reference,
      content: toNFC(rawContent),
      source,
    },
  });

  revalidatePath("/textes");
  redirect(`/textes/${texte.id}`);
}

// Delete a texte the caller owns (annotations cascade via the schema relation).
export async function deleteTexte(formData: FormData) {
  const ownerId = await requireUserId();
  const id = getString(formData, "id");

  // deleteMany with the ownerId filter guarantees no cross-user delete.
  await prisma.texte.deleteMany({ where: { id, ownerId } });

  revalidatePath("/textes");
}
