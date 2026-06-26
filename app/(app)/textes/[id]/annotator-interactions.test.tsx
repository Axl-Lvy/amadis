import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { Annotator } from "./annotator";
import { createAnnotation, deleteAnnotation } from "./actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({
  createAnnotation: vi.fn(),
  deleteAnnotation: vi.fn(),
}));

const tags = [
  { id: "tag1", layer: "pos", code: "NOUN", label: "noun" },
  { id: "tag2", layer: "sem", code: "PER", label: null },
];

afterEach(() => {
  vi.clearAllMocks();
});

// Fake the browser Selection so the folio's mouseup handler resolves a span.
function selectCodePoints(container: HTMLElement, cps: number[]) {
  const wanted = new Set(
    cps
      .map((cp) => container.querySelector(`[data-cp="${cp}"]`))
      .filter((el): el is Element => el !== null),
  );
  vi.spyOn(globalThis, "getSelection").mockReturnValue({
    isCollapsed: false,
    containsNode: (node: Node) => wanted.has(node as Element),
    removeAllRanges: vi.fn(),
  } as unknown as Selection);
}

describe("Annotator interactions", () => {
  it("opens the inscribe toolbar after a selection and creates an annotation", async () => {
    const { container } = renderWithIntl(
      <Annotator texteId="t1" content="abc" tags={tags} annotations={[]} />,
    );
    const folio = container.querySelector("p")!.parentElement!;
    selectCodePoints(container, [0, 1]);
    fireEvent.mouseUp(folio);

    // The floating toolbar is a native dialog labelled for assistive tech.
    const dialog = await screen.findByRole("dialog", { name: "Inscribe a gloss" });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Inscribe" }));
    expect(createAnnotation).toHaveBeenCalledTimes(1);
    const fd = (createAnnotation as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
    expect(fd.get("texteId")).toBe("t1");
    expect(fd.get("tagId")).toBe("tag1");
    expect(fd.get("start")).toBe("0");
    // end is exclusive: a [0,1] selection spans code points 0 and 1.
    expect(fd.get("end")).toBe("2");
  });

  it("does nothing when the selection is collapsed", () => {
    const { container } = renderWithIntl(
      <Annotator texteId="t1" content="abc" tags={tags} annotations={[]} />,
    );
    const folio = container.querySelector("p")!.parentElement!;
    vi.spyOn(globalThis, "getSelection").mockReturnValue({
      isCollapsed: true,
      containsNode: () => false,
      removeAllRanges: vi.fn(),
    } as unknown as Selection);
    fireEvent.mouseUp(folio);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("cancels the toolbar without creating anything", async () => {
    const { container } = renderWithIntl(
      <Annotator texteId="t1" content="abc" tags={tags} annotations={[]} />,
    );
    const folio = container.querySelector("p")!.parentElement!;
    selectCodePoints(container, [0]);
    fireEvent.mouseUp(folio);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createAnnotation).not.toHaveBeenCalled();
  });

  it("switches the active layer from the palette", () => {
    renderWithIntl(<Annotator texteId="t1" content="abc" tags={tags} annotations={[]} />);
    // Layers are sorted: "pos" is active first.
    const sem = screen.getByRole("button", { name: /sem/ });
    expect(sem).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(sem);
    expect(sem).toHaveAttribute("aria-pressed", "true");
  });

  it("removes an annotation from the apparatus", () => {
    const annotations = [
      { id: "a1", start: 0, end: 1, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: null },
    ];
    renderWithIntl(
      <Annotator texteId="t1" content="abc" tags={tags} annotations={annotations} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove gloss" }));
    expect(deleteAnnotation).toHaveBeenCalledTimes(1);
    const fd = (deleteAnnotation as ReturnType<typeof vi.fn>).mock.calls[0][0] as FormData;
    expect(fd.get("id")).toBe("a1");
    expect(fd.get("texteId")).toBe("t1");
  });

  it("lights coupled glyphs and bars on apparatus hover", () => {
    const annotations = [
      { id: "a1", start: 0, end: 2, tagId: "tag1", layer: "pos", code: "NOUN", label: null, note: null },
    ];
    const { container } = renderWithIntl(
      <Annotator texteId="t1" content="abc" tags={tags} annotations={annotations} />,
    );
    // The chip row is the parent of its remove button and carries the hover.
    const chip = screen.getByRole("button", { name: "Remove gloss" }).parentElement!;
    fireEvent.mouseEnter(chip);
    // A lit class lands somewhere in the folio once coupled.
    expect(container.querySelector('[class*="lit"]')).toBeInTheDocument();
    fireEvent.mouseLeave(chip);
    expect(container.querySelector('[class*="lit"]')).not.toBeInTheDocument();
  });
});
