import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  // Reset the theme the toggle writes onto <html> between tests.
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

describe("ThemeToggle", () => {
  it("defaults to dark and offers to switch to light", () => {
    renderWithIntl(<ThemeToggle />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", "Switch to light theme");
    expect(btn.textContent).toBe("☀︎");
  });

  it("reflects an existing light theme on <html>", () => {
    document.documentElement.dataset.theme = "light";
    renderWithIntl(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "aria-label",
      "Switch to dark theme",
    );
  });

  it("toggles the theme on <html> and persists it", () => {
    renderWithIntl(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("amadis-theme")).toBe("light");
    // Label and glyph follow the new state.
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-label", "Switch to dark theme");
    expect(btn.textContent).toBe("☾");

    fireEvent.click(btn);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("amadis-theme")).toBe("dark");
  });
});
