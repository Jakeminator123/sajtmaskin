"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthModal } from "@/components/auth/auth-modal";

type Status = "ready" | "invalid" | "error";

/**
 * Sista steget i "Glömt lösenord?". Token ligger i en httpOnly-cookie som
 * `/api/auth/reset-password` satte, så formuläret skickar bara lösenordet.
 */
export function PasswordResetForm({ status }: { status: Status }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [showLogin, setShowLogin] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Lösenorden stämmer inte överens.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword: confirmation }),
      });
      const data = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !data?.success) {
        setError(data?.error || "Det gick inte att byta lösenord. Försök igen.");
        return;
      }
      setPassword("");
      setConfirmation("");
      setDone(true);
    } catch {
      setError("Kunde inte kontakta servern. Försök igen.");
    } finally {
      setPending(false);
    }
  }

  const card = "bg-card w-full max-w-md space-y-5 rounded-2xl border p-6 shadow-sm";

  if (status !== "ready") {
    return (
      <div className={card}>
        <h1 className="text-2xl font-semibold">
          {status === "invalid" ? "Länken fungerar inte" : "Något gick fel"}
        </h1>
        <p className="text-muted-foreground">
          {status === "invalid"
            ? "Länken är ogiltig, har redan använts eller har gått ut. Begär en ny via Logga in → Glömt lösenord?"
            : "Vi kunde inte kontrollera länken just nu. Försök öppna den igen om en stund."}
        </p>
        <Link href="/" className="text-primary block text-sm underline underline-offset-4">
          Till startsidan
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className={card}>
        <h1 className="text-2xl font-semibold">Lösenordet är bytt</h1>
        <p role="status" className="text-muted-foreground">
          Du kan nu logga in med ditt nya lösenord.
        </p>
        <button
          type="button"
          onClick={() => setShowLogin(true)}
          className="bg-primary text-primary-foreground hover:bg-primary-hover w-full rounded-md p-3 font-medium"
        >
          Logga in
        </button>
        <AuthModal
          isOpen={showLogin}
          onClose={() => setShowLogin(false)}
          defaultMode="login"
          onSuccess={() => router.push("/projects")}
        />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={card}>
      <h1 className="text-2xl font-semibold">Välj ett nytt lösenord</h1>
      <p className="text-muted-foreground">Minst 6 tecken. Skriv samma lösenord två gånger.</p>
      <label className="block space-y-2 text-sm font-medium">
        <span>Nytt lösenord</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="bg-background w-full rounded-md border p-2 font-normal"
        />
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Bekräfta lösenord</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          maxLength={1024}
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          className="bg-background w-full rounded-md border p-2 font-normal"
        />
      </label>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <button
        disabled={pending}
        type="submit"
        className="bg-primary text-primary-foreground hover:bg-primary-hover w-full rounded-md p-3 font-medium disabled:opacity-50"
      >
        {pending ? "Sparar…" : "Spara nytt lösenord"}
      </button>
      <Link href="/" className="text-muted-foreground block text-sm underline underline-offset-4">
        Avbryt
      </Link>
    </form>
  );
}
