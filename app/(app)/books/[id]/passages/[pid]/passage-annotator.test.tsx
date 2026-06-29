import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { PassageAnnotator, type PlacementView } from "./passage-annotator";
import { deletePlacement } from "./annotator-actions";

// next/navigation: the component only uses useRouter().refresh().
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// Stub the tag-tree picker so its own (server-action backed) module is never
// pulled in. We only need the two named exports the annotator imports: the
// component and the hue helper.
vi.mock("@/app/_components/tag-tree-picker", () => ({
  TagTreePicker: () => <div data-testid="tag-picker" />,
  hueForType: () => "var(--type)",
}));

// All colocated server actions are mocked. list/search resolve to [], mutations
// resolve to a success result object.
vi.mock("./annotator-actions", () => ({
  createPlacement: vi.fn(() => Promise.resolve({ ok: true, id: "new" })),
  updatePlacement: vi.fn(() => Promise.resolve({ ok: true })),
  deletePlacement: vi.fn(() => Promise.resolve({ ok: true })),
  createRef: vi.fn(() => Promise.resolve({ ok: true, id: "r1" })),
  deleteRef: vi.fn(() => Promise.resolve({ ok: true })),
  listRefsForPlacement: vi.fn(() => Promise.resolve([])),
  searchMentionTargets: vi.fn(() => Promise.resolve([])),
}));

const tags = [
  { id: "t-root", parentId: null, type: "POS", name: "Noun" },
  { id: "t-child", parentId: "t-root", type: "POS", name: "Proper" },
];

const passage = { id: "p1", title: "Le Roi", text: "a😀b ciel" };

afterEach(() => {
  vi.clearAllMocks();
});

function render(placements: PlacementView[]) {
  return renderWithIntl(
    <PassageAnnotator passage={passage} bookId="b1" tags={tags} placements={placements} />,
  );
}

describe("PassageAnnotator rendering", () => {
  it("renders both folios (title and text) with their labels", () => {
    render([]);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
  });

  it("emits one glyph cell per code point per folio (code points, not UTF-16 units)", () => {
    // title "Le Roi" = 6 code points; text "a😀b ciel" = 8 code points
    // ("😀" is one code point / two UTF-16 units).
    const { container } = render([]);
    const cells = container.querySelectorAll("[data-cp]");
    expect(cells.length).toBe(6 + 8);
    // The emoji must render as a single cell.
    const emojiCell = Array.from(cells).find((el) => el.textContent === "😀");
    expect(emojiCell).toBeDefined();
  });

  it("shows the per-folio code-point count in the foot", () => {
    render([]);
    expect(screen.getByText("6 code points")).toBeInTheDocument();
    expect(screen.getByText("8 code points")).toBeInTheDocument();
  });

  it("renders the folio empty-state when a field has no content", () => {
    renderWithIntl(
      <PassageAnnotator
        passage={{ id: "p1", title: "", text: "abc" }}
        bookId="b1"
        tags={tags}
        placements={[]}
      />,
    );
    expect(screen.getByText("Nothing to annotate here yet.")).toBeInTheDocument();
  });
});

describe("PassageAnnotator inspector", () => {
  it("renders the empty inspector state when there are no placements", () => {
    render([]);
    expect(
      screen.getByText("Select text in the title or the text above to inscribe a placement."),
    ).toBeInTheDocument();
    // Header reports a zero count.
    expect(screen.getByText("Placements")).toBeInTheDocument();
  });

  it("lists existing placements with their code-point-sliced span text and tag path", () => {
    const placements: PlacementView[] = [
      {
        id: "pl1",
        field: "TEXT",
        // "a😀b ciel" slice [0,3) = "a😀b" (3 code points, even though "😀" is 2 UTF-16 units).
        start: 0,
        end: 3,
        description: null,
        tagIds: ["t-child"],
      },
    ];
    render(placements);
    // Inspector header carries the live count.
    expect(screen.getByText("1 placement")).toBeInTheDocument();
    // The offsets badge.
    expect(screen.getByText("[0, 3)")).toBeInTheDocument();
    // The slice text appears (code-point sliced).
    expect(screen.getAllByText(/a😀b/).length).toBeGreaterThanOrEqual(1);
    // The tag path joins the root->node names with the chevron separator.
    expect(screen.getByText("Noun › Proper")).toBeInTheDocument();
  });

  it("slices the TITLE field for a TITLE placement", () => {
    const placements: PlacementView[] = [
      // "Le Roi" slice [3,6) = "Roi".
      { id: "pl2", field: "TITLE", start: 3, end: 6, description: null, tagIds: [] },
    ];
    render(placements);
    expect(screen.getAllByText("Roi").length).toBeGreaterThanOrEqual(1);
  });

  it("renders an emptySpan marker for a zero-width placement", () => {
    const placements: PlacementView[] = [
      { id: "pl3", field: "TEXT", start: 2, end: 2, description: "gloss only", tagIds: [] },
    ];
    render(placements);
    expect(screen.getByText("(no span text)")).toBeInTheDocument();
    // The description text is shown.
    expect(screen.getByText("gloss only")).toBeInTheDocument();
  });

  it("falls back to the unknown-tag label for a tag id absent from the node set", () => {
    const placements: PlacementView[] = [
      { id: "pl4", field: "TEXT", start: 0, end: 1, description: null, tagIds: ["ghost"] },
    ];
    render(placements);
    expect(screen.getByText("unknown tag")).toBeInTheDocument();
  });
});

describe("PassageAnnotator delete", () => {
  it("calls deletePlacement with bookId, passageId, and the placement id, then refreshes", async () => {
    const placements: PlacementView[] = [
      { id: "pl1", field: "TEXT", start: 0, end: 1, description: null, tagIds: ["t-child"] },
    ];
    render(placements);

    fireEvent.click(screen.getByRole("button", { name: "Remove placement" }));

    await waitFor(() => expect(deletePlacement).toHaveBeenCalledTimes(1));
    expect(deletePlacement).toHaveBeenCalledWith("b1", "p1", "pl1");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
