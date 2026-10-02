"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PublicAnalysReport } from "@/lib/audit/public-report";
import { AnalysReport } from "./analys-report";

type AnalysToolProps = {
  restoredResult?: PublicAnalysResult | null;
  onPdf: (result: PublicAnalysResult) => void;
  onBuild: (result: PublicAnalysResult) => void;
};

export type PublicAnalysResult = {
  report: PublicAnalysReport;
  auditedUrl: string;
};

/**
 * A full run is scrape + LLM and takes ~40–60s. Without staged copy the wait
 * reads as a hang, and a guest only gets one run per day — so a reload is
 * expensive. The steps are time-based, not server progress.
 */
const PROGRESS_STEPS = [
  { afterMs: 0, text: "Hämtar sidan och följer de viktigaste undersidorna…" },
  { afterMs: 8000, text: "Läser rubriker, texter och kontaktvägar…" },
  { afterMs: 20000, text: "Bedömer målgrupp, synlighet och konvertering…" },
  { afterMs: 38000, text: "Sammanställer rapporten. Snart klart…" },
] as const;

/**
 * Client-side sanity check only. The server validates and SSRF-guards the URL;
 * this exists so an obvious typo does not consume the caller's daily run.
 */
function localUrlProblem(value: string): string | null {
  if (/\s/.test(value)) return "Webbadressen får inte innehålla mellanslag.";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return "Det där ser inte ut som en webbadress. Exempel: ertforetag.se";
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".")) {
    return "Ange en fullständig domän, till exempel ertforetag.se";
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return "Vi kan bara analysera publika webbplatser.";
  }
  return null;
}

export function publicAnalysErrorMessage(input: {
  status: number;
  fallback: string;
  code?: string;
}): string {
  if (input.code === "public_analys_daily_quota_exhausted") {
    return "Ni har redan kört en analys från den här uppkopplingen i dag. Skapa ett konto om ni vill köra fler.";
  }
  if (input.code === "public_analys_in_progress") {
    return "En analys behandlas redan från den här uppkopplingen. Vänta tills den är klar.";
  }
  if (input.code === "public_analys_attempt_rate_limited") {
    return "För många analysförsök på kort tid. Vänta en stund och försök igen.";
  }
  if (input.status === 409 || input.status === 429) return input.fallback;
  if (input.status >= 500) {
    return "Analysen gick inte igenom just nu. Vänta en stund och försök igen.";
  }
  return input.fallback;
}

export function AnalysTool({ restoredResult = null, onPdf, onBuild }: AnalysToolProps) {
  const [url, setUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicAnalysResult | null>(restoredResult);
  const [progressStep, setProgressStep] = useState(0);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (restoredResult) setResult(restoredResult);
  }, [restoredResult]);

  useEffect(() => {
    if (!isRunning) {
      setProgressStep(0);
      return;
    }
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const next = PROGRESS_STEPS.reduce(
        (acc, step, index) => (elapsed >= step.afterMs ? index : acc),
        0,
      );
      setProgressStep(next);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Ange en webbadress.");
      return;
    }

    const problem = localUrlProblem(trimmed);
    if (problem) {
      setError(problem);
      return;
    }

    setIsRunning(true);
    setError(null);
    startedAtRef.current = Date.now();

    try {
      const response = await fetch("/api/analys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        report?: PublicAnalysReport;
        error?: string;
        code?: string;
      } | null;

      if (!response.ok || !payload?.success || !payload.report) {
        const fallback =
          payload?.error || "Kunde inte analysera sajten. Kontrollera adressen och försök igen.";
        setError(
          publicAnalysErrorMessage({
            status: response.status,
            fallback,
            code: payload?.code,
          }),
        );
        return;
      }

      setResult({ report: payload.report, auditedUrl: trimmed });
    } catch {
      setError("Nätverksfel. Försök igen om en stund.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-10">
      <form
        onSubmit={handleSubmit}
        className="border-border/50 bg-card/40 mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center"
      >
        <label className="sr-only" htmlFor="analys-url">
          Webbplatsadress
        </label>
        <Input
          id="analys-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="https://ertforetag.se"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={isRunning}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "analys-error" : undefined}
          className="h-12 flex-1 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="lg"
          disabled={isRunning}
          className="btn-3d bg-primary text-primary-foreground hover:bg-primary-hover h-12 shrink-0 px-6 font-medium"
        >
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Analyserar…
            </>
          ) : (
            <>
              Analysera sajten
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      {error ? (
        <p
          id="analys-error"
          className="text-destructive mx-auto mt-4 max-w-2xl text-center text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {isRunning ? (
        <div
          className="text-muted-foreground mx-auto mt-6 max-w-xl text-center text-sm"
          aria-live="polite"
        >
          <p>{PROGRESS_STEPS[progressStep].text}</p>
          <p className="mt-2 text-xs">
            Det tar ungefär en minut. Lämna inte sidan — rapporten visas här.
          </p>
        </div>
      ) : null}

      {result ? (
        <AnalysReport
          report={result.report}
          auditedUrl={result.auditedUrl}
          onPdf={() => onPdf(result)}
          onBuild={() => onBuild(result)}
        />
      ) : null}
    </div>
  );
}
