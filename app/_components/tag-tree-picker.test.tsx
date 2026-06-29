import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TagNode } from "@/lib/tag-tree";
import { renderWithIntl } from "@/test-utils/intl";

import { TagTreePicker } from "./tag-tree-picker";
import {
  createTag,
  searchChildren,
  searchRootTags,
  searchRootTypes,
} from "@/app/(app)/tags/actions";

vi.mock("@/app/(app)/tags/actions", () => ({
  searchRootTypes: vi.fn(),
  searchRootTags: vi.fn(),
  searchChildren: vi.fn(),
  createTag: vi.fn(),
}));

const types = searchRootTypes as unknown as ReturnType<typeof vi.fn>;
const roots = searchRootTags as unknown as ReturnType<typeof vi.fn>;
const children = searchChildren as unknown as ReturnType<typeof vi.fn>;
const create = createTag as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

const posRoot: TagNode = { id: "t-pos", parentId: null, type: "POS", name: "Noun" };
const posChild: TagNode = { id: "t-noun-prop", parentId: "t-pos", type: null, name: "Proper" };

// Controlled wrapper so onChange actually updates `value`, mirroring real use,
// and exposes the last selection for assertions.
function Harness({ onChange }: { onChange?: (ids: string[]) => void }) {
  const [value, setValue] = useState<string[]>([]);
  return (
    <TagTreePicker
      value={value}
      onChange={(ids) => {
        setValue(ids);
        onChange?.(ids);
      }}
      allTags={[posRoot, posChild]}
    />
  );
}

describe("TagTreePicker", () => {
  it("renders the type stage and lists matching root types", async () => {
    types.mockResolvedValue(["POS", "Morphology"]);
    renderWithIntl(<Harness />);

    const input = screen.getByLabelText("Type");
    fireEvent.change(input, { target: { value: "PO" } });

    // The debounced effect (140ms) calls searchRootTypes and renders options.
    expect(await screen.findByRole("button", { name: "POS" })).toBeInTheDocument();
    expect(types).toHaveBeenCalled();
  });

  it("walks type -> name -> child and commits a removable chip with onChange(id)", async () => {
    types.mockResolvedValue(["POS"]);
    roots.mockResolvedValue([posRoot]);
    children.mockResolvedValue([posChild]);
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);

    // Stage TYPE: pick POS.
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "POS" } });
    fireEvent.click(await screen.findByRole("button", { name: "POS" }));

    // Stage NAME: searchRootTags ran; pick the Noun root.
    await waitFor(() => expect(roots).toHaveBeenCalledWith("POS", ""));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Noun" } });
    fireEvent.click(await screen.findByRole("button", { name: "Noun" }));

    // Stage CHILD: searchChildren ran against the chosen parent.
    await waitFor(() => expect(children).toHaveBeenCalledWith("t-pos", ""));

    // Commit the deepest selected node (Noun) as a chip.
    fireEvent.click(screen.getByRole("button", { name: "Add tag" }));
    expect(onChange).toHaveBeenCalledWith(["t-pos"]);

    // A removable chip for the full path now exists.
    const removeBtn = await screen.findByRole("button", { name: /Remove/ });
    expect(removeBtn).toBeInTheDocument();

    // Removing it calls onChange back to [].
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("creates a new node from a free query and commits it", async () => {
    types.mockResolvedValue([]);
    roots.mockResolvedValue([]);
    const fresh: TagNode = { id: "t-new", parentId: null, type: "POS", name: "Verb" };
    create.mockResolvedValue({ ok: true, tag: fresh });
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);

    // Type stage: free-enter a type with Enter.
    const typeInput = screen.getByLabelText("Type");
    fireEvent.change(typeInput, { target: { value: "POS" } });
    fireEvent.keyDown(typeInput, { key: "Enter" });

    // Name stage: no existing roots, so "Create" is offered for the typed name.
    const nameInput = await screen.findByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Verb" } });

    const createBtn = await screen.findByRole("button", { name: /Create/ });
    fireEvent.click(createBtn);

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({ parentId: null, type: "POS", name: "Verb" }),
    );

    // The created node becomes the parent; commit it as a chip.
    fireEvent.click(await screen.findByRole("button", { name: "Add tag" }));
    expect(onChange).toHaveBeenCalledWith(["t-new"]);
  });

  it("surfaces a createTag error", async () => {
    types.mockResolvedValue([]);
    roots.mockResolvedValue([]);
    create.mockResolvedValue({ ok: false, error: "A tag name is required" });
    renderWithIntl(<Harness />);

    const typeInput = screen.getByLabelText("Type");
    fireEvent.change(typeInput, { target: { value: "POS" } });
    fireEvent.keyDown(typeInput, { key: "Enter" });

    const nameInput = await screen.findByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Bad" } });
    fireEvent.keyDown(nameInput, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("A tag name is required");
  });
});
