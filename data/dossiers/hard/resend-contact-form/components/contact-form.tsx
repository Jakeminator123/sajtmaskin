"use client";

import { useState, type FormEvent } from "react";

import { IntegrationConfigNotice } from "@/components/integration-config-notice";

interface ContactFormProps {
  subjectPrefix?: string;
  className?: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; email: string }
  | { kind: "not-configured" }
  | { kind: "error"; message: string };

export function ContactForm({ subjectPrefix, className }: ContactFormProps) {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    if (!name || !email || !message) {
      setState({ kind: "error", message: "Fyll i namn, e-post och meddelande." });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setState({ kind: "error", message: "E-postadressen ser inte giltig ut." });
      return;
    }

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          subject: subjectPrefix ? `${subjectPrefix}: ${subject || "(inget ämne)"}` : subject,
          message,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      // Integration not wired up yet: degrade calmly instead of surfacing a raw
      // error. We check both the status and the error code so the client never
      // has to guess on the status alone.
      if (res.status === 503 || body.error === "email-not-configured") {
        setState({ kind: "not-configured" });
        return;
      }
      if (!res.ok || !body.ok) {
        setState({
          kind: "error",
          message: "Meddelandet kunde inte skickas just nu. Försök igen om en stund.",
        });
        return;
      }
      setState({ kind: "success", email });
      form.reset();
    } catch {
      setState({
        kind: "error",
        message: "Meddelandet kunde inte skickas just nu. Kontrollera din anslutning och försök igen.",
      });
    }
  }

  if (state.kind === "success") {
    return (
      <div className={className}>
        <div className="rounded-lg border border-border bg-card p-6 text-card-foreground">
          <h3 className="text-lg font-semibold">Tack — ditt meddelande är på väg.</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Vi svarar på <span className="font-medium">{state.email}</span> så snart vi kan.
          </p>
        </div>
      </div>
    );
  }

  const submitting = state.kind === "submitting";
  const notConfigured = state.kind === "not-configured";

  return (
    <form className={className} onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Namn</span>
          <input
            name="name"
            required
            autoComplete="name"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">E-post</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
      </div>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-foreground">Ämne (valfritt)</span>
        <input
          name="subject"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium text-foreground">Meddelande</span>
        <textarea
          name="message"
          required
          rows={6}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>
      {notConfigured && (
        <div className="mt-4">
          <IntegrationConfigNotice
            title="Kontaktformuläret är inte aktiverat ännu"
            message="För att ta emot meddelanden behöver sajten kopplas till Resend. Lägg till env-nycklarna nedan (de fungerar som lösenord och ska hållas hemliga). Under tiden kan du höra av dig direkt via e-post."
            envKeys={["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"]}
            docHref="https://resend.com/api-keys"
            docLabel="Så skapar du en Resend-nyckel"
          />
        </div>
      )}
      {state.kind === "error" && (
        <p className="mt-3 text-sm text-destructive">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={submitting || notConfigured}
        className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? "Skickar…" : "Skicka meddelande"}
      </button>
    </form>
  );
}
