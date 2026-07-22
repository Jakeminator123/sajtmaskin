"use client";

import { useEffect, useRef, useState } from "react";

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
  label = "Betala nu",
  className,
  successUrl,
  cancelUrl,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Demo modal: focus the close button on open, close on Escape.
  useEffect(() => {
    if (!demoOpen) return;
    closeButtonRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDemoOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [demoOpen]);

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
        // Demo mode (mock: visual): Stripe is not wired yet, so the click
        // opens an honest demo modal instead of charging anyone. Gate ONLY on
        // the explicit error code from the route — a platform/proxy 503
        // (Stripe actually configured) must take the normal retryable error
        // path below, not flip the CTA into demo mode.
        if (body.error === "payments-not-configured") {
          setDemoOpen(true);
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
      {demoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDemoOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-demo-title"
            className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg"
          >
            <p id="checkout-demo-title" className="text-base font-semibold text-foreground">
              Demoläge — ingen riktig betalning
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Så här ser betalflödet ut för besökare. Inga pengar dras i demoläget. Koppla
              Stripe för att ta emot riktiga betalningar.
            </p>
            <IntegrationConfigNotice
              className="mt-3"
              title="Aktivera riktiga betalningar"
              message="Lägg till env-nyckeln nedan (den fungerar som ett lösenord och ska hållas hemlig), så byts demoläget automatiskt mot riktig Stripe Checkout."
              envKeys={["STRIPE_SECRET_KEY"]}
              docHref="https://dashboard.stripe.com/apikeys"
              docLabel="Så hittar du din Stripe-nyckel"
            />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setDemoOpen(false)}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-border bg-muted px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/70"
            >
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
