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

  it("deepens the cover class where annotations overlap", () => {
    const annotations = [
      { id: "a", start: 0, end: 3, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: null },
      { id: "b", start: 1, end: 2, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: null },
    ];
    const { container } = render(
      <Annotator texteId="t1" content="abc" tags={tags} annotations={annotations} />,
    );
    const spans = container.querySelectorAll<HTMLElement>("[data-cp]");
    // index 0: covered once, index 1: covered twice (overlap), index 2: once.
    expect(spans[0].className).toContain("bg-yellow-200/70");
    expect(spans[1].className).toContain("bg-orange-300/70");
    expect(spans[2].className).toContain("bg-yellow-200/70");
  });

  it("lists annotations with their code-point-sliced text", () => {
    const annotations = [
      { id: "a", start: 1, end: 2, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: "hi" },
    ];
    render(
      <Annotator texteId="t1" content="a😀b" tags={tags} annotations={annotations} />,
    );
    expect(screen.getByText("Annotations (1)")).toBeInTheDocument();
    // The slice [1,2) is the emoji, JSON-quoted in the list.
    expect(screen.getByText('"😀"')).toBeInTheDocument();
    expect(screen.getByText(/hi/)).toBeInTheDocument();
  });

  it("shows the empty-state message when there is no content", () => {
    render(<Annotator texteId="t1" content="" tags={tags} annotations={[]} />);
    expect(screen.getByText(/No transcription yet/)).toBeInTheDocument();
  });
});
