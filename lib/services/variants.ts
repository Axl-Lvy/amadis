import { randomUUID } from "node:crypto";

import { toNFC } from "@/lib/offsets";
import { prisma } from "@/lib/prisma";
import { presignGet, presignPut } from "@/lib/r2";

import { ServiceError } from "./errors";

// Alternative versions of a passage: each has its own text and its own scan
// (image or PDF) and can be referenced from a description. Owner-scoped; scans
// are namespaced ${ownerId}/${passageId}/variant/... so a key can only land in
// the caller's own space.

export type CreateVariantInput = {
  passageId: string;
  label?: string | null;
  text?: string;
};
export type UpdateVariantInput = { label?: string | null; text?: string };

export async function listVariants(ownerId: string, passageId: string) {
  const passage = await prisma.passage.findFirst({
    where: { id: passageId, ownerId },
    select: { id: true },
  });
  if (!passage) throw new ServiceError("passageNotFound");
  return prisma.variant.findMany({
    where: { ownerId, passageId },
    orderBy: { createdAt: "asc" },
  });
}

export async function getVariant(ownerId: string, id: string) {
  const variant = await prisma.variant.findFirst({ where: { id, ownerId } });
  if (!variant) throw new ServiceError("variantNotFound");
  return variant;
}

export async function createVariant(ownerId: string, input: CreateVariantInput) {
  const passage = await prisma.passage.findFirst({
    where: { id: input.passageId, ownerId },
    select: { id: true },
  });
  if (!passage) throw new ServiceError("passageNotFound");
  return prisma.variant.create({
    data: {
      ownerId,
      passageId: input.passageId,
      label: input.label?.trim() || null,
      text: toNFC(input.text ?? ""),
    },
  });
}

export async function updateVariant(
  ownerId: string,
  id: string,
  input: UpdateVariantInput,
) {
  const data: { label?: string | null; text?: string } = {};
  if (input.label !== undefined) data.label = input.label?.trim() || null;
  if (input.text !== undefined) data.text = toNFC(input.text);
  const res = await prisma.variant.updateMany({ where: { id, ownerId }, data });
  if (res.count === 0) throw new ServiceError("variantNotFound");
}

export async function deleteVariant(ownerId: string, id: string) {
  const res = await prisma.variant.deleteMany({ where: { id, ownerId } });
  if (res.count === 0) throw new ServiceError("variantNotFound");
}

// ---- scans (per variant) --------------------------------------------------

export async function presignVariantScanUpload(
  ownerId: string,
  variantId: string,
  filename: string,
  contentType: string,
) {
  const variant = await getVariant(ownerId, variantId);
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const key = `${ownerId}/${variant.passageId}/variant/${variantId}/${randomUUID()}-${safeName}`;
  const url = await presignPut(key, contentType || "application/octet-stream");
  return { url, key };
}

export async function attachVariantScan(ownerId: string, variantId: string, key: string) {
  const variant = await getVariant(ownerId, variantId);
  if (!key.startsWith(`${ownerId}/${variant.passageId}/variant/${variantId}/`)) {
    throw new ServiceError("invalidScanKey");
  }
  await prisma.variant.updateMany({
    where: { id: variantId, ownerId },
    data: { scanKey: key },
  });
}

export async function presignVariantScanView(
  ownerId: string,
  variantId: string,
): Promise<string | null> {
  const variant = await prisma.variant.findFirst({
    where: { id: variantId, ownerId },
    select: { scanKey: true },
  });
  if (!variant) throw new ServiceError("variantNotFound");
  return variant.scanKey ? presignGet(variant.scanKey) : null;
}
