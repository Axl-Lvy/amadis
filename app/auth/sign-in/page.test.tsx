import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

vi.mock("./actions", () => ({ signInWithEmail: vi.fn() }));

import SignInPage from "./page";

describe("SignInPage", () => {
  it("renders English copy by default", () => {
    renderWithIntl(<SignInPage />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders French copy under the fr locale", () => {
    renderWithIntl(<SignInPage />, "fr");
    expect(screen.getByRole("heading", { name: "Bon retour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
  });
});
