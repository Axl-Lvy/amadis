import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { resolveLocale } from "@/i18n/resolve-locale";

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const locale = resolveLocale(
    cookieStore.get("NEXT_LOCALE")?.value,
    headerStore.get("accept-language"),
  );

  return {
    locale,
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});
