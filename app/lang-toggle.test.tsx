import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

const setLocale = vi.fn();
vi.mock("@/app/i18n-actions", () => ({ setLocale: (l: string) => setLocale(l) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LangToggle } from "./lang-toggle";

describe("LangToggle", () => {
  it("shows the other language and switches to it on click", () => {
    renderWithIntl(<LangToggle />, "en");
    const button = screen.getByRole("button", { name: /Français|FR/i });
    fireEvent.click(button);
    expect(setLocale).toHaveBeenCalledWith("fr");
  });
});
