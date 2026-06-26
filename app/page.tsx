import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { signOut } from "@/app/auth/actions";
import { LangToggle } from "@/app/lang-toggle";
import { ThemeToggle } from "@/app/theme-toggle";
import { auth } from "@/lib/auth/server";

// Reads the session from cookies, so it must render dynamically.
export const dynamic = "force-dynamic";

// A static specimen of the interlinear idea: a word carries colored layer lanes.
function Lane({ hue, top }: Readonly<{ hue: number; top: number }>) {
  return (
    <span
      className="bar"
      aria-hidden="true"
      style={
        {
          ["--c" as string]: `var(--hue-${hue})`,
          top: `calc(100% + ${top}px)`,
        } as React.CSSProperties
      }
    />
  );
}

export default async function Home() {
  const { data: session } = await auth.getSession();
  const t = await getTranslations();

  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>
        <div className="actions">
          <ThemeToggle />
          <LangToggle />
          {session?.user ? (
            <>
              <Link href="/dashboard" className="ghost">
                {t("nav.dashboard")}
              </Link>
              <form action={signOut}>
                <button type="submit" className="ghost">
                  {t("nav.signOut")}
                </button>
              </form>
            </>
          ) : (
            <Link href="/auth/sign-in" className="ghost">
              {t("nav.signIn")}
            </Link>
          )}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">{t("home.hero.eyebrow")}</p>
        <h1>{t("home.hero.heading")}</h1>
        <p className="lede">{t("home.hero.lede")}</p>

        <div className="hero-cta">
          {session?.user ? (
            <Link href="/textes" className="btn btn-primary" style={{ textDecoration: "none" }}>
              {t("home.hero.openTextes")}
            </Link>
          ) : (
            <>
              <Link
                href="/auth/sign-up"
                className="btn btn-primary"
                style={{ textDecoration: "none" }}
              >
                {t("home.hero.createAccount")}
              </Link>
              <Link
                href="/auth/sign-in"
                className="btn btn-ghost"
                style={{ textDecoration: "none" }}
              >
                {t("nav.signIn")}
              </Link>
            </>
          )}
        </div>

        <div className="specimen">
          <p className="cap">Chanson de Roland — Laisse I · f.1r</p>
          <div className="spec">
            <span className="w">
              Carles
              <Lane hue={1} top={6} />
              <Lane hue={2} top={12} />
            </span>{" "}
            li{" "}
            <span className="w">
              reis
              <Lane hue={1} top={6} />
            </span>
            , nostre{" "}
            <span className="w">
              emperere
              <Lane hue={4} top={6} />
            </span>{" "}
            <span className="w">
              magnes
              <Lane hue={4} top={6} />
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
