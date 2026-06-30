import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";

// pdf.js can't run in jsdom: stub the renderer to a simple host.
vi.mock("@/app/_components/pdf-document", () => ({
  PdfPages: ({
    onPointClick,
    overlay,
  }: {
    onPointClick?: (p: { page: number; frac: number }) => void;
    overlay?: (g: unknown) => ReactNode;
  }) => (
    <div data-testid="pdf-pages">
      <button
        type="button"
        data-testid="pdf-point"
        onClick={() => onPointClick?.({ page: 1, frac: 0.5 })}
      />
      {/* Render the overlay with a fake geometry so marks/areas appear. */}
      {overlay?.({
        pageTops: [0],
        pageHeights: [1000],
        pageLefts: [0],
        pageWidths: [600],
        contentHeight: 1000,
      })}
    </div>
  ),
}));
// next-intl: identity translator.
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// Stub the heavy annotator; we only assert composition here.
vi.mock("./passages/[pid]/passage-annotator", () => ({
  PassageAnnotator: ({ passage }: { passage: { id: string } }) => (
    <div data-testid={`annotator-${passage.id}`} />
  ),
}));
vi.mock("./actions", () => ({
  updatePassageAction: vi.fn().mockResolvedValue({ ok: true }),
  presignBookPdfUploadAction: vi.fn(),
  attachBookPdfAction: vi.fn(),
  addMarkAction: vi.fn(),
  moveMarkAction: vi.fn(),
  removeMarkAction: vi.fn(),
}));

import { BookPdf } from "./book-pdf";

const passages = [
  { id: "p1", number: 1, title: "T1", text: "hello", tags: [], placements: [] },
  { id: "p2", number: 2, title: "T2", text: "world", tags: [], placements: [] },
];

describe("BookPdf view modes", () => {
  it("renders the PDF host in areas mode and an annotator per passage", () => {
    render(<BookPdf bookId="b1" hasPdf marks={[]} passages={passages} />);
    expect(screen.getByTestId("pdf-pages")).toBeInTheDocument();
    expect(screen.getByTestId("annotator-p1")).toBeInTheDocument();
    expect(screen.getByTestId("annotator-p2")).toBeInTheDocument();
  });

  it("switches to passages-only mode (no PDF host)", () => {
    render(<BookPdf bookId="b1" hasPdf marks={[]} passages={passages} />);
    fireEvent.click(screen.getByText("viewPassages"));
    expect(screen.queryByTestId("pdf-pages")).not.toBeInTheDocument();
    expect(screen.getByTestId("annotator-p1")).toBeInTheDocument();
  });
});

describe("AreasMode marks", () => {
  beforeEach(() => {
    // Clear view-mode preference so tests always start in areas mode.
    globalThis.localStorage?.removeItem("pdf-view-mode:b1");
  });

  it("adds a mark when a page point is clicked", async () => {
    const { addMarkAction } = await import("./actions");
    // Drive the click through the mocked PdfPages by exposing onPointClick.
    // Re-mock PdfPages for this block to call onPointClick on click.
    // (Handled by the module mock below.)
    render(<BookPdf bookId="b1" hasPdf marks={[]} passages={passages} />);
    fireEvent.click(screen.getByTestId("pdf-point"));
    expect(addMarkAction).toHaveBeenCalledWith("b1", 1, 0.5);
  });

  it("shows surplus passages after the PDF when there are more passages than areas", () => {
    // 0 marks => 1 area => passage 1 aligns; passage 2 is surplus.
    render(<BookPdf bookId="b1" hasPdf marks={[]} passages={passages} />);
    expect(screen.getByText("surplusPassages")).toBeInTheDocument();
  });

  it("calls removeMarkAction with mark id and bookId when the remove button is clicked", async () => {
    const { removeMarkAction } = await import("./actions");
    render(
      <BookPdf
        bookId="b1"
        hasPdf
        marks={[{ id: "m1", page: 1, frac: 0.5 }]}
        passages={passages}
      />,
    );
    // The mocked PdfPages renders the overlay with fake geometry, so MarkLayer
    // renders the mark with a ✕ button whose aria-label is t("removeMark") = "removeMark".
    fireEvent.click(screen.getByRole("button", { name: "removeMark" }));
    expect(removeMarkAction).toHaveBeenCalledWith("m1", "b1");
  });
});
