import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { VariantsPanel, type VariantView } from "./variants-panel";
import {
  createVariant,
  deleteVariant,
  updateVariant,
} from "./variant-actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  useParams: () => ({ id: "b1" }),
}));

// Keep jsdom away from pdf.js: the scan VIEW path is never triggered in these
// tests, but stub the document component defensively anyway.
vi.mock("@/app/_components/pdf-document", () => ({
  PdfDocument: () => null,
}));

vi.mock("./variant-actions", () => ({
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  deleteVariant: vi.fn(),
  presignVariantScanUpload: vi.fn(),
  attachVariantScan: vi.fn(),
  presignVariantScanView: vi.fn(),
}));

const create = createVariant as unknown as ReturnType<typeof vi.fn>;
const update = updateVariant as unknown as ReturnType<typeof vi.fn>;
const remove = deleteVariant as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

function fields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

describe("VariantsPanel", () => {
  it("shows the empty state when there are no variants", () => {
    renderWithIntl(<VariantsPanel passageId="p1" variants={[]} />);
    expect(screen.getByText("No alternative versions yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a version" })).toBeInTheDocument();
  });

  it("lists each variant (label or untitled) and its text", () => {
    const variants: VariantView[] = [
      { id: "v1", label: "Manuscript A", text: "Premier vers", scanKey: null },
      { id: "v2", label: null, text: "", scanKey: null },
    ];
    renderWithIntl(<VariantsPanel passageId="p1" variants={variants} />);
    expect(screen.getByRole("heading", { name: "Manuscript A" })).toBeInTheDocument();
    expect(screen.getByText("Premier vers")).toBeInTheDocument();
    // Variant with no label shows the untitled placeholder, no text shows noText.
    expect(screen.getByText("Untitled version")).toBeInTheDocument();
    expect(screen.getByText("No text transcribed.")).toBeInTheDocument();
  });

  it("creates a variant from the add-a-version form", async () => {
    create.mockResolvedValue({ ok: true });
    renderWithIntl(<VariantsPanel passageId="p1" variants={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a version" }));
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "Manuscript B" },
    });
    fireEvent.change(screen.getByLabelText("Transcribed text"), {
      target: { value: "Un autre vers" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(fields(create.mock.calls[0][0])).toEqual({
      bookId: "b1",
      passageId: "p1",
      label: "Manuscript B",
      text: "Un autre vers",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("surfaces a create error without refreshing", async () => {
    create.mockResolvedValue({ ok: false, error: "Variant not found" });
    renderWithIntl(<VariantsPanel passageId="p1" variants={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add a version" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Variant not found")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("edits a variant via updateVariant", async () => {
    update.mockResolvedValue({ ok: true });
    const variants: VariantView[] = [
      { id: "v1", label: "Manuscript A", text: "Premier vers", scanKey: null },
    ];
    renderWithIntl(<VariantsPanel passageId="p1" variants={variants} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Manuscript A"), {
      target: { value: "Manuscript A (rev)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(fields(update.mock.calls[0][0])).toEqual({
      bookId: "b1",
      passageId: "p1",
      id: "v1",
      label: "Manuscript A (rev)",
      text: "Premier vers",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("deletes a variant via deleteVariant", async () => {
    remove.mockResolvedValue({ ok: true });
    const variants: VariantView[] = [
      { id: "v1", label: "Manuscript A", text: "Premier vers", scanKey: null },
    ];
    renderWithIntl(<VariantsPanel passageId="p1" variants={variants} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(remove).toHaveBeenCalled());
    expect(fields(remove.mock.calls[0][0])).toEqual({
      bookId: "b1",
      passageId: "p1",
      id: "v1",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("offers a view button only when a scan is attached (image variant)", () => {
    const variants: VariantView[] = [
      { id: "v1", label: "With scan", text: "x", scanKey: "owner/b1/scan/folio.png" },
    ];
    renderWithIntl(<VariantsPanel passageId="p1" variants={variants} />);
    // Image scan present: the view toggle is offered and the no-scan note is gone.
    expect(screen.getByRole("button", { name: "View scan" })).toBeInTheDocument();
    expect(screen.queryByText("No scan attached.")).not.toBeInTheDocument();
  });

  it("shows the no-scan note when no scan is attached", () => {
    const variants: VariantView[] = [
      { id: "v1", label: "No scan", text: "x", scanKey: null },
    ];
    renderWithIntl(<VariantsPanel passageId="p1" variants={variants} />);
    expect(screen.getByText("No scan attached.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View scan" })).not.toBeInTheDocument();
  });
});
