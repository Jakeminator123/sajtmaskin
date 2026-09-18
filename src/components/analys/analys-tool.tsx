"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AuditResult } from "@/types/audit";
import { AnalysReport } from "./analys-report";

type AnalysToolProps = {
  onNeedAccount: () => void;
};

function rateLimitMessage(status: number, fallback: string): string {
  if (status === 429) {
    return "Ni har redan kört en analys från den här uppkopplingen de senaste 24 timmarna. Skapa ett konto om ni vill köra fler via produkten.";
  }
  return fallback;
}

export function AnalysTool({ onNeedAccount }: AnalysToolProps) {
  const [url, setUrl] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [auditedUrl, setAuditedUrl] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Ange en webbadress.");
      return;
    }

    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/analys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; result?: AuditResult; error?: string }
        | null;

      if (!response.ok || !payload?.success || !payload.result) {
        const fallback =
          payload?.error || "Kunde inte analysera sajten. Kontrollera adressen och försök igen.";
        setError(rateLimitMessage(response.status, fallback));
        return;
      }

      setResult(payload.result);
      setAuditedUrl(trimmed);
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
        <p className="text-destructive mx-auto mt-4 max-w-2xl text-center text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {isRunning ? (
        <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-center text-sm">
          Vi hämtar sidan och går igenom målgrupp, synlighet och konvertering. Det kan ta en stund.
        </p>
      ) : null}

      {result ? (
        <AnalysReport result={result} auditedUrl={auditedUrl} onNeedAccount={onNeedAccount} />
      ) : null}
    </div>
  );
}
