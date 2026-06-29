"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { isServiceError } from "@/lib/services/errors";
import {
  createPlacement as createPlacementSvc,
  deletePlacement as deletePlacementSvc,
  updatePlacement as updatePlacementSvc,
  type PlacementField,
} from "@/lib/services/placements";
import {
  createRef as createRefSvc,
  deleteRef as deleteRefSvc,
  listRefsFor as listRefsForSvc,
} from "@/lib/services/references";
import {
  searchMentionTargets as searchMentionTargetsSvc,
  type MentionCandidate,
} from "@/lib/services/search";
import { requireUserId } from "@/lib/session";

// Server actions backing the passage annotator (#22) and its cross-reference
// mentions (#23). Mutations the client invokes programmatically return a result
// object so the translated message survives the production build (thrown
// server-action errors are masked in prod). The owner id always comes from the
// session, never the client. Each mutation revalidates the passage page so the
// integrator's Server Component re-renders with fresh placements.

function passagePath(bookId: string, passageId: string): string {
  return `/books/${bookId}/passages/${passageId}`;
}

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function translate(e: unknown): Promise<{ ok: false; error: string }> {
  if (isServiceError(e)) {
    const t = await getTranslations("errors");
    return { ok: false, error: t(e.code) };
  }
  throw e;
}

// Create one placement: a span on the passage TITLE or TEXT carrying 0..n tags
// and/or a description. Tagless description-only placements are allowed; the
// service rejects placements with neither a tag nor a description.
export async function createPlacement(
  bookId: string,
  input: {
    passageId: string;
    field: PlacementField;
    start: number;
    end: number;
    tagIds?: string[];
    description?: string | null;
  },
): Promise<Result<{ id: string }>> {
  const ownerId = await requireUserId();
  try {
    const placement = await createPlacementSvc(ownerId, input);
    revalidatePath(passagePath(bookId, input.passageId));
    return { ok: true, id: placement.id };
  } catch (e) {
    return translate(e);
  }
}

// Replace a placement's tags and/or description (re-validates non-empty).
export async function updatePlacement(
  bookId: string,
  passageId: string,
  id: string,
  input: { tagIds?: string[]; description?: string | null },
): Promise<Result> {
  const ownerId = await requireUserId();
  try {
    await updatePlacementSvc(ownerId, id, input);
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true };
  } catch (e) {
    return translate(e);
  }
}

export async function deletePlacement(
  bookId: string,
  passageId: string,
  id: string,
): Promise<Result> {
  const ownerId = await requireUserId();
  try {
    await deletePlacementSvc(ownerId, id);
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true };
  } catch (e) {
    return translate(e);
  }
}

// Persist a cross-reference from a placement (the description's mention chip).
export async function createRef(
  bookId: string,
  passageId: string,
  input: { sourceId: string; targetType: "PLACEMENT" | "PASSAGE" | "VARIANT"; targetId: string },
): Promise<Result<{ id: string }>> {
  const ownerId = await requireUserId();
  try {
    const ref = await createRefSvc(ownerId, input);
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true, id: ref.id };
  } catch (e) {
    return translate(e);
  }
}

// Remove a cross-reference (deleting a mention chip).
export async function deleteRef(
  bookId: string,
  passageId: string,
  id: string,
): Promise<Result> {
  const ownerId = await requireUserId();
  try {
    await deleteRefSvc(ownerId, id);
    revalidatePath(passagePath(bookId, passageId));
    return { ok: true };
  } catch (e) {
    return translate(e);
  }
}

// Refs of a placement, each resolved to {label, href, exists} for chip rendering.
export type RefView = {
  id: string;
  targetType: "PLACEMENT" | "PASSAGE" | "VARIANT";
  targetId: string;
  resolved: { type: "PLACEMENT" | "PASSAGE" | "VARIANT"; id: string; label: string; href: string; exists: boolean };
};

export async function listRefsForPlacement(placementId: string): Promise<RefView[]> {
  const ownerId = await requireUserId();
  return listRefsForSvc(ownerId, placementId) as Promise<RefView[]>;
}

// Search the owner's corpus for a mention target (read-only).
export async function searchMentionTargets(
  query: string,
  limit?: number,
): Promise<MentionCandidate[]> {
  const ownerId = await requireUserId();
  return searchMentionTargetsSvc(ownerId, query, limit);
}
