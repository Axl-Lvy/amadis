import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

const pathname = vi.fn(() => "/textes");
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/app/auth/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/app/i18n-actions", () => ({ setLocale: vi.fn() }));

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders the nav, the user identity and a sign-out control", () => {
    renderWithIntl(
      <AppShell user={{ name: "Marie", email: "marie@example.com" }}>
        <p>page body</p>
      </AppShell>,
    );
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Textes")).toBeInTheDocument();
    expect(screen.getByText("Marie")).toBeInTheDocument();
    expect(screen.getByText("marie@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByText("page body")).toBeInTheDocument();
  });

  it("marks the active route with aria-current", () => {
    pathname.mockReturnValue("/textes/abc");
    renderWithIntl(
      <AppShell user={{ name: "Marie", email: null }}>
        <span />
      </AppShell>,
    );
    const textes = screen.getByRole("link", { name: /Textes/ });
    expect(textes).toHaveAttribute("aria-current", "page");
    const dashboard = screen.getByRole("link", { name: /Dashboard/ });
    expect(dashboard).not.toHaveAttribute("aria-current");
  });

  it("falls back to an initial and a default name when identity is sparse", () => {
    pathname.mockReturnValue("/dashboard");
    renderWithIntl(
      <AppShell user={{ name: null, email: null }}>
        <span />
      </AppShell>,
    );
    expect(screen.getByText("Scholar")).toBeInTheDocument();
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("opens and closes the mobile navigation", () => {
    pathname.mockReturnValue("/dashboard");
    const { container } = renderWithIntl(
      <AppShell user={{ name: "Marie", email: "marie@example.com" }}>
        <span />
      </AppShell>,
    );
    const sidebar = container.querySelector(".sidebar");
    expect(sidebar).toHaveAttribute("data-open", "false");

    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(sidebar).toHaveAttribute("data-open", "true");
    const backdrop = container.querySelector(".backdrop");
    expect(backdrop).toBeInTheDocument();

    // Tapping the backdrop closes the drawer again.
    fireEvent.click(backdrop!);
    expect(sidebar).toHaveAttribute("data-open", "false");
  });

  it("closes the drawer when a nav link is followed", () => {
    pathname.mockReturnValue("/dashboard");
    const { container } = renderWithIntl(
      <AppShell user={{ name: "Marie", email: "marie@example.com" }}>
        <span />
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(container.querySelector(".sidebar")).toHaveAttribute("data-open", "true");
    fireEvent.click(screen.getByText("Textes"));
    expect(container.querySelector(".sidebar")).toHaveAttribute("data-open", "false");
  });
});
