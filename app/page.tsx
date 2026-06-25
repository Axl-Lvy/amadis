import Link from "next/link";

import { signOut } from "@/app/auth/actions";
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

  return (
    <main className="page">
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="logo" />
          <span className="name">amadis</span>
        </Link>
        <div className="actions">
          <ThemeToggle />
          {session?.user ? (
            <>
              <Link href="/dashboard" className="ghost">
                Dashboard
              </Link>
              <form action={signOut}>
                <button type="submit" className="ghost">
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <Link href="/auth/sign-in" className="ghost">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <section className="hero">
        <p className="eyebrow">Old French · digital philology</p>
        <h1>Annotate the manuscript, layer by layer.</h1>
        <p className="lede">
          amadis is a reading room for Old French texts. Transcribe a folio, attach its
          scan, then gloss any word or passage across parts of speech, lemmas, morphology
          and meaning — each layer its own colour, stacked beneath the line.
        </p>

        <div className="hero-cta">
          {session?.user ? (
            <Link href="/textes" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Open my textes
            </Link>
          ) : (
            <>
              <Link
                href="/auth/sign-up"
                className="btn btn-primary"
                style={{ textDecoration: "none" }}
              >
                Create an account
              </Link>
              <Link
                href="/auth/sign-in"
                className="btn btn-ghost"
                style={{ textDecoration: "none" }}
              >
                Sign in
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
