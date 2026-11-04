"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function EmailVerificationForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Lösenorden stämmer inte överens.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword: confirmation, returnTo }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error || "Verifieringen misslyckades. Försök igen.");
        return;
      }
      router.replace(data.redirectTo);
    } catch {
      setError("Kunde inte kontakta servern. Försök igen.");
    } finally {
      setPending(false);
    }
  }

  return <form onSubmit={submit} className="bg-background w-full max-w-md space-y-5 rounded-xl border p-6 shadow-sm">
    <h1 className="text-2xl font-semibold">Bekräfta din e-post</h1>
    <p>Välj det lösenord du vill använda. Det ersätter lösenordet från registreringen. Därefter kan du logga in.</p>
    <label className="block space-y-2">Lösenord
      <input aria-label="Lösenord" type="password" autoComplete="new-password" required minLength={6} maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} className="bg-background w-full rounded-md border p-2" />
    </label>
    <label className="block space-y-2">Bekräfta lösenord
      <input aria-label="Bekräfta lösenord" type="password" autoComplete="new-password" required minLength={6} maxLength={1024} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="bg-background w-full rounded-md border p-2" />
    </label>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <button disabled={pending} type="submit" className="bg-primary text-primary-foreground w-full rounded-md p-3 disabled:opacity-50">{pending ? "Bekräftar…" : "Bekräfta och fortsätt"}</button>
    <a href={returnTo} className="block text-sm underline">Tillbaka till inloggning</a>
  </form>;
}
