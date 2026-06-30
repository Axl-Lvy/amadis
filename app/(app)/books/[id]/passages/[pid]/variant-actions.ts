"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { getString } from "@/lib/forms";
import { isServiceError } from "@/lib/services/errors";
import * as variants from "@/lib/services/variants";
import { requireUserId } from "@/lib/session";

// Server-action wrappers for the variants feature. Every mutation a client
// component invokes programmatically returns a result object so the error
// message survives the production build (thrown server-action messages are
// masked in prod). ServiceError codes map 1:1 to keys under the `errors`
// namespace. Owner ids are never taken from the client — they come from the
// session via requireUserId().

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

// Revalidate the passage detail page so the server re-renders its variant list.
function passagePath(bookId: string, passageId: string) {
  return `/books/${bookId}/passages/${passageId}`;
}

export async function createVariant(formData: FormData): Promise<Result> {
  const ownerId = await requireUserId();
  const bookId = getString(formData, "bookId");
  const passageId = getString(formData, "passageId");
  const label = getString(formData, "label");
  const text = getString(formData, "text");

  try {
    await variants.createVariant(ownerId, { passageId, label, text });
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

export async function updateVariant(formData: FormData): Promise<Result> {
  const ownerId = await requireUserId();
  const bookId = getString(formData, "bookId");
  const passageId = getString(formData, "passageId");
  const id = getString(formData, "id");
  const label = getString(formData, "label");
  const text = getString(formData, "text");

  try {
    await variants.updateVariant(ownerId, id, { label, text });
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

export async function deleteVariant(formData: FormData): Promise<Result> {
  const ownerId = await requireUserId();
  const bookId = getString(formData, "bookId");
  const passageId = getString(formData, "passageId");
  const id = getString(formData, "id");

  try {
    await variants.deleteVariant(ownerId, id);
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

// Issue a presigned PUT so the browser uploads the scan bytes straight to R2.
// The key is namespaced by owner/passage/variant in the service.
export async function presignVariantScanUpload(
  variantId: string,
  filename: string,
  contentType: string,
): Promise<Result<{ url: string; key: string }>> {
  const ownerId = await requireUserId();
  try {
    const { url, key } = await variants.presignVariantScanUpload(
      ownerId,
      variantId,
      filename,
      contentType,
    );
    return { ok: true, url, key };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

// Record the uploaded scan's key on the variant (after a successful browser PUT).
export async function attachVariantScan(
  bookId: string,
  passageId: string,
  variantId: string,
  key: string,
): Promise<Result> {
  const ownerId = await requireUserId();
  try {
    await variants.attachVariantScan(ownerId, variantId, key);
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

// Presigned GET URL to view a stored scan (owner-checked in the service).
// `url` is null when the variant has no scan attached.
export async function presignVariantScanView(
  variantId: string,
): Promise<Result<{ url: string | null }>> {
  const ownerId = await requireUserId();
  try {
    const url = await variants.presignVariantScanView(ownerId, variantId);
    return { ok: true, url };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}
