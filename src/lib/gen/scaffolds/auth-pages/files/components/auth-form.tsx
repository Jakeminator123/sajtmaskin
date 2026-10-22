"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardFooter } from "@/components/ui/card";
import {
  authAdapter,
  type AuthAdapter,
  type AuthIntent,
  type AuthResult,
  type AuthSubmission,
} from "../lib/auth-adapter";

const submitLabels: Record<AuthIntent, string> = {
  login: "Logga in",
  signup: "Registrera",
  "reset-password": "Skicka återställningslänk",
};
const mismatchMessage = "Lösenorden matchar inte.";
const timeoutMessage =
  "Tjänsten svarade inte i tid. Kontrollera statusen hos tjänsten innan du försöker igen.";
const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function AuthForm({
  intent,
  adapter = authAdapter,
}: {
  intent: AuthIntent;
  adapter?: AuthAdapter;
}) {
  // Keep native POST disabled until our submit handler is hydrated.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  // A synchronous lock also covers two submits before React commits pending.
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || inFlight.current) return;
    const form = event.currentTarget;
    setError(null);
    setStatus(null);
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();
    if (intent === "signup") {
      if (!name) {
        setError("Ange ditt namn.");
        return;
      }
      if (password !== String(data.get("passwordConfirmation") ?? "")) {
        setError(mismatchMessage);
        return;
      }
    }
    const input: AuthSubmission =
      intent === "reset-password"
        ? { intent, email }
        : intent === "signup"
          ? { intent, email, name, password }
          : { intent, email, password };
    inFlight.current = true;
    setPending(true);
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const timedOut = new Promise<AuthResult>((resolve) => {
        timeout = setTimeout(() => {
          resolve({ ok: false, message: timeoutMessage });
          controller.abort();
        }, 30_000);
      });
      // A provider that ignores abort must not hold the form or update it late.
      const result = await Promise.race([adapter.submit(input, controller.signal), timedOut]);
      if (result.ok) setStatus(result.message);
      else setError(result.message);
    } catch {
      // Provider exceptions may contain credentials or internal details.
      setError(
        controller.signal.aborted
          ? timeoutMessage
          : "Det gick inte att kontakta autentiseringstjänsten. Försök igen.",
      );
    } finally {
      clearTimeout(timeout);
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={handleSubmit} aria-busy={pending}>
      <noscript>Aktivera JavaScript för formulärförhandsvisningen.</noscript>
      <fieldset disabled={!hydrated || pending} className="min-w-0 space-y-4">
        <CardContent className="space-y-4">
          {intent === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="name">Namn</Label>
              <Input id="name" name="name" autoComplete="name" required className="bg-card" />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="namn@example.com"
              required
              className="bg-card"
            />
          </div>
          {intent !== "reset-password" ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Lösenord</Label>
                {intent === "login" ? (
                  <Link
                    href="/forgot-password"
                    className="text-muted-foreground text-sm hover:underline"
                  >
                    Glömt lösenord?
                  </Link>
                ) : null}
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={intent === "login" ? "current-password" : "new-password"}
                minLength={intent === "signup" ? 8 : undefined}
                required
                className="bg-card"
              />
            </div>
          ) : null}
          {intent === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="passwordConfirmation">Bekräfta lösenord</Label>
              <Input
                id="passwordConfirmation"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                aria-invalid={error === mismatchMessage}
                aria-describedby={error === mismatchMessage ? "auth-error" : undefined}
                className="bg-card"
              />
            </div>
          ) : null}
          {error ? (
            <p id="auth-error" role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {status ? (
            <p role="status" className="text-muted-foreground text-sm">
              {status}
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" size="lg" className="w-full" disabled={!hydrated || pending}>
            {pending ? "Skickar…" : submitLabels[intent]}
          </Button>
          {intent === "login" ? (
            <p className="text-muted-foreground text-sm">
              Har du inget konto?{" "}
              <Link href="/signup" className="text-foreground font-medium hover:underline">
                Registrera
              </Link>
            </p>
          ) : (
            <Link href="/login" className="text-muted-foreground text-sm hover:underline">
              Tillbaka till inloggning
            </Link>
          )}
        </CardFooter>
      </fieldset>
    </form>
  );
}
