"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Glömt lösenord?" inne i inloggningsrutan. Servern svarar likadant oavsett
 * om adressen finns, så panelen visar alltid samma bekräftelse.
 */
export function ForgotPasswordPanel({
  initialEmail,
  onBack,
}: {
  initialEmail: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
      } | null;
      if (response.status === 429) {
        setError("För många försök. Vänta en stund och försök igen.");
        return;
      }
      if (!response.ok || !data?.success) {
        setError(data?.error || "Det gick inte att skicka länken. Försök igen.");
        return;
      }
      setMessage(data.message || "Om kontot finns har vi skickat en länk.");
    } catch {
      setError("Kunde inte ansluta till servern");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="relative z-10 p-6 pb-4 text-center">
        <h2
          id="auth-modal-title"
          className="text-foreground text-2xl font-(--font-heading) tracking-tight"
        >
          Återställ lösenord
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Ange din e-post så skickar vi en länk där du väljer ett nytt lösenord.
        </p>
      </div>

      <form onSubmit={submit} className="relative z-10 space-y-4 p-6 pt-0">
        <div className="space-y-1.5">
          <label htmlFor="forgot-email" className="text-foreground/90 text-sm font-medium">
            E-post
          </label>
          <div className="relative">
            <Mail className="text-muted-foreground/70 absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder="din@email.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border-border/35 bg-background/40 text-foreground placeholder:text-muted-foreground/60 focus-visible:border-primary/45 h-11 pl-10"
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="border-destructive/35 bg-destructive/10 text-destructive rounded-xl border p-3 text-sm"
          >
            {error}
          </div>
        )}
        {message && (
          <div
            role="status"
            className="border-primary/35 bg-primary/10 text-primary rounded-xl border p-3 text-sm"
          >
            {message}
          </div>
        )}

        <Button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary-hover h-11 w-full font-medium"
          disabled={pending}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skicka länk"}
        </Button>
      </form>

      <div className="text-muted-foreground relative z-10 p-6 pt-0 text-center text-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-primary hover:text-primary/80 font-medium"
        >
          Tillbaka till inloggning
        </button>
      </div>
    </>
  );
}
