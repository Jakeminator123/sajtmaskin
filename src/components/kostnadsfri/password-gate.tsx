"use client";

import { useState, useCallback, type FormEvent } from "react";
import { Lock, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import type { KostnadsfriCompanyData } from "@/lib/kostnadsfri";

/**
 * PasswordGate — First phase of the kostnadsfri flow.
 * Shows a clean, centered password input with the company name as heading.
 */

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
    <div className="flex min-h-screen items-center justify-center px-4">
      {/* Ambient background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-teal/5 blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[300px] w-[300px] rounded-full bg-purple-500/5 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / brand */}
        <div className="mb-8 text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-brand-teal/20 to-brand-teal/5 ring-1 ring-brand-teal/20">
            <Lock className="h-7 w-7 text-brand-teal" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-white">{companyName}</h1>
          <p className="text-sm text-gray-400">
            Ange lösenordet du fick i mailet för att komma igång
          </p>
        </div>

        {/* Password form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ange lösenord..."
              autoFocus
              disabled={isLoading}
              className="w-full rounded-xl border border-gray-800 bg-gray-900/80 px-5 py-4 text-white placeholder-gray-500 backdrop-blur-sm transition-all focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:outline-none disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
              {attempts >= 3 && (
                <span className="ml-auto text-xs text-red-500/60">
                  {5 - attempts} försök kvar
                </span>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!password.trim() || isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-teal px-6 py-4 font-semibold text-black transition-all hover:bg-brand-teal/90 focus:ring-2 focus:ring-brand-teal/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Verifierar...
              </>
            ) : (
              <>
                Kom igång
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-gray-600">
          Drivs av SajtMaskin — AI-driven webbdesign
        </p>
      </div>
    </div>
  );
}
