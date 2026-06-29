import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { BookHeader } from "./book-header";
import { updateBookAction } from "./actions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./actions", () => ({ updateBookAction: vi.fn() }));

const update = updateBookAction as unknown as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe("BookHeader", () => {
  it("shows the title and author", () => {
    renderWithIntl(<BookHeader id="b1" title="Chanson de Roland" author="Turold" />);
    expect(screen.getByRole("heading", { name: "Chanson de Roland" })).toBeInTheDocument();
    expect(screen.getByText("Turold")).toBeInTheDocument();
  });

  it("falls back to the no-author label when author is null", () => {
    renderWithIntl(<BookHeader id="b1" title="Roland" author={null} />);
    expect(screen.getByText("No author")).toBeInTheDocument();
  });

  it("enters edit mode and saves via updateBookAction, then refreshes", async () => {
    update.mockResolvedValue({ ok: true });
    renderWithIntl(<BookHeader id="b1" title="Roland" author="Turold" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Roland"), {
      target: { value: "Le Roman de la Rose" },
    });
    fireEvent.change(screen.getByDisplayValue("Turold"), {
      target: { value: "Guillaume" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("b1", {
        title: "Le Roman de la Rose",
        author: "Guillaume",
      }),
    );
    expect(refresh).toHaveBeenCalled();
    // Returns to the read view (heading shows the title again).
    expect(await screen.findByRole("heading", { name: "Roland" })).toBeInTheDocument();
  });

  it("sends author:null when the author field is cleared", async () => {
    update.mockResolvedValue({ ok: true });
    renderWithIntl(<BookHeader id="b1" title="Roland" author="Turold" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByDisplayValue("Turold"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("b1", { title: "Roland", author: null }),
    );
  });

  it("surfaces the action error and stays in edit mode", async () => {
    update.mockResolvedValue({ ok: false, error: "A book title is required" });
    renderWithIntl(<BookHeader id="b1" title="Roland" author={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A book title is required");
    expect(refresh).not.toHaveBeenCalled();
    // Still editing: the title input is present.
    expect(screen.getByDisplayValue("Roland")).toBeInTheDocument();
  });
});
