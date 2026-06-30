"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";

import { getString } from "@/lib/forms";
import {
  createTag as createTagSvc,
  deleteTag as deleteTagSvc,
  renameTag as renameTagSvc,
  searchChildren as searchChildrenSvc,
  searchRootTags as searchRootTagsSvc,
  searchRootTypes as searchRootTypesSvc,
} from "@/lib/services/tags";
import { isServiceError } from "@/lib/services/errors";
import type { TagNode } from "@/lib/tag-tree";
import { requireUserId } from "@/lib/session";

// Server actions backing the tag-tree picker (#14) and the tag management view.
// The search actions return plain data arrays (read-only, never throw on a bad
// query). The mutations either return a result object the client can render
// (create/rename/delete invoked programmatically) or throw for plain <form>
// actions. Owner id always comes from the session, never the client.

// --- searches (read-only) ---

export async function searchRootTypes(query: string): Promise<string[]> {
  const ownerId = await requireUserId();
  return searchRootTypesSvc(ownerId, query);
}

export async function searchRootTags(type: string, query: string): Promise<TagNode[]> {
  const ownerId = await requireUserId();
  return searchRootTagsSvc(ownerId, type, query);
}

export async function searchChildren(parentId: string, query: string): Promise<TagNode[]> {
  const ownerId = await requireUserId();
  return searchChildrenSvc(ownerId, parentId, query);
}

// --- mutations ---

// Find-or-create a node at any level. Returns the node so the picker can keep
// its id (it persists each level as the user descends). Result object so the
// translated error survives the production build.
export async function createTag(input: {
  parentId?: string | null;
  type?: string | null;
  name: string;
}): Promise<{ ok: true; tag: TagNode } | { ok: false; error: string }> {
  const ownerId = await requireUserId();
  try {
    const tag = await createTagSvc(ownerId, input);
    revalidatePath("/tags");
    return { ok: true, tag };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

// Rename invoked programmatically (inline editor in the management view).
export async function renameTag(
  id: string,
  name: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerId = await requireUserId();
  try {
    await renameTagSvc(ownerId, id, name);
    revalidatePath("/tags");
    return { ok: true };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

// Delete invoked programmatically. Deleting a node cascades to its descendants
// and to placement_tag rows (schema onDelete: Cascade) — a documented choice.
export async function deleteTag(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownerId = await requireUserId();
  try {
    await deleteTagSvc(ownerId, id);
    revalidatePath("/tags");
    return { ok: true };
  } catch (e) {
    if (isServiceError(e)) {
      const t = await getTranslations("errors");
      return { ok: false, error: t(e.code) };
    }
    throw e;
  }
}

// --- plain <form> actions for the management view (no client state needed) ---

// Create a root tag (type, name) from the management view's "new root" form.
export async function createRootTagForm(formData: FormData) {
  const ownerId = await requireUserId();
  const type = getString(formData, "type").trim();
  const name = getString(formData, "name").trim();
  await createTagSvc(ownerId, { parentId: null, type, name });
  revalidatePath("/tags");
}

// Create a child tag under a parent from the management view's inline form.
export async function createChildTagForm(formData: FormData) {
  const ownerId = await requireUserId();
  const parentId = getString(formData, "parentId");
  const name = getString(formData, "name").trim();
  await createTagSvc(ownerId, { parentId, name });
  revalidatePath("/tags");
}

// Rename a node from the management view's inline rename form.
export async function renameTagForm(formData: FormData) {
  const ownerId = await requireUserId();
  const id = getString(formData, "id");
  const name = getString(formData, "name");
  await renameTagSvc(ownerId, id, name);
  revalidatePath("/tags");
}

// Delete a node (cascades to descendants + placement_tag rows) from the form.
export async function deleteTagForm(formData: FormData) {
  const ownerId = await requireUserId();
  const id = getString(formData, "id");
  await deleteTagSvc(ownerId, id);
  revalidatePath("/tags");
}
