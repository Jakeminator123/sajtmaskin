"use client";

import { useState } from "react";

import { IntegrationConfigNotice } from "./integration-config-notice";

interface CheckoutButtonProps {
  priceId: string;
  label?: string;
  className?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export function CheckoutButton({
  priceId,
  label = "Prenumerera",
  className,
  successUrl,
  cancelUrl,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, successUrl, cancelUrl }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        // Integration not wired up yet: degrade calmly instead of surfacing a
        // raw error. Gate ONLY on the explicit error code from the route — a
        // platform/proxy 503 (Stripe actually configured) must take the normal
        // retryable error path below, not flip the CTA into setup mode.
        if (body.error === "payments-not-configured") {
          setNotConfigured(true);
          setLoading(false);
          return;
        }
        throw new Error("Det gick inte att starta betalningen. Försök igen om en stund.");
      }
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Det gick inte att starta betalningen. Försök igen om en stund.",
      );
      setLoading(false);
    }
  }

  if (notConfigured) {
    return (
      <div className={className}>
        <IntegrationConfigNotice
          title="Betalningar är inte aktiverade ännu"
          message="För att ta emot betalningar behöver sajten kopplas till Stripe. Lägg till env-nyckeln nedan (den fungerar som ett lösenord och ska hållas hemlig)."
          envKeys={["STRIPE_SECRET_KEY"]}
          docHref="https://dashboard.stripe.com/apikeys"
          docLabel="Så hittar du din Stripe-nyckel"
        />
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Konfigurera Stripe för att aktivera betalningar"
          className="mt-3 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground opacity-50"
        >
          {label}
        </button>
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {loading ? "Laddar…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
