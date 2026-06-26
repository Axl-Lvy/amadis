"use server";

import { randomUUID } from "node:crypto";

import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { getString } from "@/lib/forms";
import { codePointLength } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";
import { r2, R2_BUCKET } from "@/lib/r2";
import { requireUserId } from "@/lib/session";

// Confirm the texte exists and belongs to the caller. Returns its content length.
async function ownedTexte(ownerId: string, texteId: string) {
  const texte = await prisma.texte.findFirst({
    where: { id: texteId, ownerId },
    select: { id: true, content: true },
  });
  if (!texte) {
    const t = await getTranslations("errors");
    throw new Error(t("texteNotFound"));
  }
  return texte;
}

// Create a tag for the current user. Uniqueness is per-user on (layer, code).
export async function createTag(formData: FormData) {
  const ownerId = await requireUserId();
  const layer = getString(formData, "layer").trim();
  const code = getString(formData, "code").trim();
  const label = getString(formData, "label").trim() || null;
  const texteId = getString(formData, "texteId");
  if (!layer || !code) {
    const t = await getTranslations("errors");
    throw new Error(t("tagLayerCodeRequired"));
  }

  await prisma.tag.upsert({
    where: { ownerId_layer_code: { ownerId, layer, code } },
    update: { label },
    create: { ownerId, layer, code, label },
  });

  revalidatePath(`/textes/${texteId}`);
}

// Create an annotation over a code-point span. Offsets are validated against the
// stored NFC content length; overlapping spans are allowed by design.
export async function createAnnotation(formData: FormData) {
  const ownerId = await requireUserId();
  const texteId = getString(formData, "texteId");
  const tagId = getString(formData, "tagId");
  const start = Number(formData.get("start"));
  const end = Number(formData.get("end"));
  const note = getString(formData, "note").trim() || null;

  const texte = await ownedTexte(ownerId, texteId);
  const len = codePointLength(texte.content);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > len ||
    start >= end
  ) {
    const t = await getTranslations("errors");
    throw new Error(t("invalidSpan"));
  }

  // Confirm the tag is the caller's too (no cross-user tag reference).
  const tag = await prisma.tag.findFirst({
    where: { id: tagId, ownerId },
    select: { id: true },
  });
  if (!tag) {
    const t = await getTranslations("errors");
    throw new Error(t("tagNotFound"));
  }

  await prisma.annotation.create({
    data: { ownerId, texteId, tagId, start, end, note },
  });

  revalidatePath(`/textes/${texteId}`);
}

// Delete one annotation the caller owns.
export async function deleteAnnotation(formData: FormData) {
  const ownerId = await requireUserId();
  const id = getString(formData, "id");
  const texteId = getString(formData, "texteId");

  await prisma.annotation.deleteMany({ where: { id, ownerId } });

  revalidatePath(`/textes/${texteId}`);
}

// Issue a presigned PUT URL so the browser uploads the scan straight to R2.
// The key is namespaced by owner and texte; bytes never pass through Vercel.
export async function presignScanUpload(
  texteId: string,
  filename: string,
  contentType: string,
) {
  const ownerId = await requireUserId();
  await ownedTexte(ownerId, texteId);

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = `${ownerId}/${texteId}/${randomUUID()}-${safeName}`;

  const url = await getSignedUrl(
    r2,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );

  return { url, key };
}

// Record the uploaded scan's key on the texte (after a successful browser PUT).
export async function attachScan(texteId: string, key: string) {
  const ownerId = await requireUserId();
  if (!key.startsWith(`${ownerId}/${texteId}/`)) {
    const t = await getTranslations("errors");
    throw new Error(t("invalidScanKey"));
  }
  await prisma.texte.updateMany({
    where: { id: texteId, ownerId },
    data: { scanKey: key },
  });
  revalidatePath(`/textes/${texteId}`);
}

// Presigned GET URL to view a stored scan (owner-checked).
export async function presignScanView(texteId: string): Promise<string | null> {
  const ownerId = await requireUserId();
  const texte = await prisma.texte.findFirst({
    where: { id: texteId, ownerId },
    select: { scanKey: true },
  });
  if (!texte?.scanKey) {
    return null;
  }
  return getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: texte.scanKey }),
    { expiresIn: 300 },
  );
}
