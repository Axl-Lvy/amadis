import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Annotator } from "./annotator";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  createAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
}));

const tags = [{ id: "tag1", layer: "pos", code: "NOUN", label: null }];

describe("Annotator rendering", () => {
  it("renders one span per code point, not per UTF-16 unit", () => {
    // "a😀b" is 3 code points / 4 UTF-16 units. The annotator works in code-point
    // space, so it must emit exactly 3 [data-cp] spans.
    const { container } = render(
      <Annotator texteId="t1" content="a😀b" tags={tags} annotations={[]} />,
    );
    const spans = container.querySelectorAll("[data-cp]");
    expect(spans).toHaveLength(3);
    expect(spans[1].textContent).toBe("😀");
  });

  it("marks deeper coverage where annotations overlap", () => {
    const annotations = [
      { id: "a", start: 0, end: 3, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: null },
      { id: "b", start: 1, end: 2, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: null },
    ];
    const { container } = render(
      <Annotator texteId="t1" content="abc" tags={tags} annotations={annotations} />,
    );
    const spans = container.querySelectorAll<HTMLElement>("[data-cp]");
    // index 0: covered once, index 1: covered twice (overlap), index 2: once.
    expect(spans[0].dataset.cover).toBe("1");
    expect(spans[1].dataset.cover).toBe("2");
    expect(spans[2].dataset.cover).toBe("1");
  });

  it("lists annotations with their code-point-sliced text in the apparatus", () => {
    const annotations = [
      { id: "a", start: 1, end: 2, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: "hi" },
    ];
    render(
      <Annotator texteId="t1" content="a😀b" tags={tags} annotations={annotations} />,
    );
    // Inspector header carries the live count.
    expect(screen.getByText(/Apparatus · 1/)).toBeInTheDocument();
    // The apparatus lists the annotation by its code-point offsets [1, 2).
    expect(screen.getByText("[1, 2)")).toBeInTheDocument();
    // The slice [1,2) is the emoji, shown as the gloss source (folio + apparatus).
    expect(screen.getAllByText("😀").length).toBeGreaterThanOrEqual(1);
    // The note is shown alongside the tag code.
    expect(screen.getByText(/hi/)).toBeInTheDocument();
  });

  it("shows the empty-state message when there is no content", () => {
    render(<Annotator texteId="t1" content="" tags={tags} annotations={[]} />);
    expect(screen.getByText(/No transcription yet/)).toBeInTheDocument();
  });
});
