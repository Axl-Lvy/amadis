"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toNFC } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/session";

// Create a texte. Content is optional (a scan can come first, transcription later)
// and is NFC-normalized so annotation offsets are computed against stable text.
export async function createTexte(formData: FormData) {
  const ownerId = await requireUserId();

  const reference = String(formData.get("reference") ?? "").trim();
  if (!reference) {
    throw new Error("Reference is required");
  }
  const rawContent = String(formData.get("content") ?? "");
  const source = String(formData.get("source") ?? "").trim() || null;

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
  const id = String(formData.get("id") ?? "");

  // deleteMany with the ownerId filter guarantees no cross-user delete.
  await prisma.texte.deleteMany({ where: { id, ownerId } });

  revalidatePath("/textes");
}
