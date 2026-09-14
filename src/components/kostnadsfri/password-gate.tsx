"use client";

import { useState, useCallback, useId, type FormEvent } from "react";
import { ArrowRight, Loader2, AlertCircle, Check } from "lucide-react";
import type { KostnadsfriCompanyData } from "@/lib/kostnadsfri";
import { KOSTNADSFRI_INTRO_DURATION_LABEL } from "@/lib/kostnadsfri/media";
import { IntroVideo } from "./intro-video";

/**
 * PasswordGate — First phase of the kostnadsfri flow.
 *
 * Two columns on desktop: the intro film is the visual anchor on the left, the
 * password card sits to the right. Mobile stacks it film → card → step list,
 * so the film stays the first thing you see without burying the input.
 */

/** Written out because the film must not be the only carrier of this. */
const STEPS = [
  "Svara på tre korta frågor om er verksamhet.",
  "SajtMaskin bygger ett förslag på er nya webbplats.",
  "Ni behöver inte installera något — allt sker i webbläsaren.",
];

interface PasswordGateProps {
  slug: string;
  companyName: string;
  onSuccess: (data: KostnadsfriCompanyData) => void;
}

export function PasswordGate({ slug, companyName, onSuccess }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const passwordId = useId();
  const errorId = useId();
  const headingId = useId();

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!password.trim() || isLoading) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/kostnadsfri/${slug}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: password.trim() }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          setAttempts((prev) => prev + 1);
          setError(data.error || "Felaktigt lösenord.");
          return;
        }

        onSuccess(data.companyData);
      } catch {
        setError("Kunde inte ansluta. Kontrollera din internetanslutning.");
      } finally {
        setIsLoading(false);
      }
    },
    [password, isLoading, slug, onSuccess],
  );

  return (
    <div className="relative min-h-screen bg-background">
      {/* A single, calm wash of brand colour instead of competing orbs. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[60vh] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--brand-teal)/0.10),transparent_70%)]"
      />

      {/* Grid rather than two flex columns: the step list reads best under the
          film on desktop but must sit *after* the card on mobile, so the
          password field stays within reach of the first screen. */}
      <main className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-5 pt-10 pb-28 lg:min-h-screen lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:content-center lg:gap-x-12 lg:gap-y-7 lg:px-8 lg:pt-16 lg:pb-24 xl:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        {/* ── Film ──────────────────────────────────────────── */}
        <header className="lg:col-start-1 lg:row-start-1">
          <p className="text-xs font-medium tracking-[0.18em] text-brand-teal uppercase">
            Kostnadsfri webbplats
          </p>
          <h1 className="mt-3 text-3xl leading-tight font-(--font-heading) tracking-tight text-balance text-foreground sm:text-4xl">
            {companyName}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-pretty text-muted-foreground sm:text-base">
            Filmen förklarar erbjudandet på {KOSTNADSFRI_INTRO_DURATION_LABEL}. Du kan också gå
            direkt vidare med koden du fick i mejlet.
          </p>

          <IntroVideo className="mt-6" />
        </header>

        {/* ── Password card ─────────────────────────────────── */}
        {/* z-[60] + top alignment for the same reason MiniWizard carries it:
            the Sajtagenten teaser (OpenClawChat) is fixed at z-50 in the
            bottom-right corner and swallowed the click on "Kom igång" on a
            1280x800 viewport. Aligning the card to the top keeps them apart
            geometrically; the z-index guarantees the click on short screens. */}
        <section
          aria-labelledby={headingId}
          className="relative z-[60] lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start"
        >
          <div className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-black/20 sm:p-8">
            <h2 id={headingId} className="text-xl font-semibold text-card-foreground">
              Kom igång
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Ange lösenordet du fick i mailet för att komma igång
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor={passwordId}
                  className="mb-2 block text-sm font-medium text-card-foreground"
                >
                  Lösenord från mejlet
                </label>
                <input
                  id={passwordId}
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ange lösenord..."
                  autoComplete="one-time-code"
                  autoFocus
                  disabled={isLoading}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-foreground placeholder-muted-foreground transition-colors focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/30 focus:outline-none disabled:opacity-50"
                />
              </div>

              {error && (
                <div
                  id={errorId}
                  role="alert"
                  className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{error}</span>
                  {attempts >= 3 && (
                    <span className="ml-auto shrink-0 text-xs opacity-70">
                      {5 - attempts} försök kvar
                    </span>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={!password.trim() || isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-teal px-6 py-3.5 font-semibold text-background transition-colors hover:bg-brand-teal/90 focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    Verifierar...
                  </>
                ) : (
                  <>
                    Kom igång
                    <ArrowRight className="h-5 w-5" aria-hidden />
                  </>
                )}
              </button>
            </form>
          </div>
        </section>

        {/* ── What happens next, in text ────────────────────── */}
        <ul className="grid gap-2.5 lg:col-start-1 lg:row-start-2">
          {STEPS.map((step) => (
            <li key={step} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" aria-hidden />
              <span>{step}</span>
            </li>
          ))}
        </ul>

        <p className="text-center text-xs text-muted-foreground lg:col-span-2 lg:row-start-3 lg:pt-2">
          Drivs av SajtMaskin — AI-driven webbdesign
        </p>
      </main>
    </div>
  );
}
