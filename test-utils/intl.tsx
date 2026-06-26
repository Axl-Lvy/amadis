import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const catalogs = { en, fr };

export function renderWithIntl(
  ui: ReactElement,
  locale: "en" | "fr" = "en",
): RenderResult {
  return render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
}
