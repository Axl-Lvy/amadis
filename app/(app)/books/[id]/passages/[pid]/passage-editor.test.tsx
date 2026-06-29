import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { PassageEditor } from "./passage-editor";
import { updatePassageAction } from "../../actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("../../actions", () => ({ updatePassageAction: vi.fn() }));

const update = updatePassageAction as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

const passage = { id: "p1", number: 7, title: "Le Chevalier", text: "Bonjour" };

describe("PassageEditor", () => {
  it("seeds the number, title and text fields from props", () => {
    renderWithIntl(<PassageEditor bookId="b1" passage={passage} />);
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Le Chevalier")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bonjour")).toBeInTheDocument();
  });

  it("saves the edited fields with the parsed number and refreshes", async () => {
    update.mockResolvedValue({ ok: true });
    renderWithIntl(<PassageEditor bookId="b1" passage={passage} />);

    fireEvent.change(screen.getByDisplayValue("Le Chevalier"), {
      target: { value: "Renaud" },
    });
    fireEvent.change(screen.getByDisplayValue("7"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("p1", "b1", {
        number: 9,
        title: "Renaud",
        text: "Bonjour",
      }),
    );
    expect(refresh).toHaveBeenCalled();
    // Saved confirmation surfaces.
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("sends number:undefined for a blank number rather than 0", async () => {
    update.mockResolvedValue({ ok: true });
    renderWithIntl(<PassageEditor bookId="b1" passage={passage} />);

    fireEvent.change(screen.getByDisplayValue("7"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith("p1", "b1", {
      number: undefined,
      title: "Le Chevalier",
      text: "Bonjour",
    });
  });

  it("shows the error returned by the action", async () => {
    update.mockResolvedValue({ ok: false, error: "Passage not found" });
    renderWithIntl(<PassageEditor bookId="b1" passage={passage} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passage not found");
    expect(refresh).not.toHaveBeenCalled();
  });
});
