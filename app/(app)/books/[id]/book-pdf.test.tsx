import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// pdf.js can't run in jsdom: stub the renderer to a simple host.
vi.mock("@/app/_components/pdf-document", () => ({
  PdfPages: () => <div data-testid="pdf-pages" />,
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
